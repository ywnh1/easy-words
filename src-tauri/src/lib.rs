mod content;
mod db;
mod docx;
mod pdf;

use serde::Serialize;
use std::path::PathBuf;
use tauri::{Manager, State};
use tauri_plugin_save_share::{SaveFileArgs, SaveShareExt};

struct AppState {
    db_path: PathBuf,
}

#[derive(Serialize)]
pub struct ExportResult {
    /// 完整路径（桌面用来打开文件）
    pub path: String,
    /// 给用户看的短路径，Android 上是「Download/Easy Words/xxx.pdf」
    pub display_path: String,
    /// Android 分享用的 content:// URI；桌面为空
    pub uri: String,
    pub count: usize,
    pub file_name: String,
    pub size: u64,
}

#[tauri::command]
fn catalog(state: State<'_, AppState>) -> Result<Vec<db::BookInfo>, String> {
    let con = db::open(&state.db_path).map_err(|e| e.to_string())?;
    db::catalog(&con).map_err(|e| e.to_string())
}

#[tauri::command]
fn preview(
    state: State<'_, AppState>,
    filter: db::Filter,
    limit: Option<usize>,
) -> Result<Vec<db::EntryView>, String> {
    let con = db::open(&state.db_path).map_err(|e| e.to_string())?;
    db::query(&con, &filter, limit).map_err(|e| e.to_string())
}

/// 只统计，不取全量，用于在选题面板上显示「命中 N 条」。
#[tauri::command]
fn count_entries(state: State<'_, AppState>, filter: db::Filter) -> Result<usize, String> {
    let con = db::open(&state.db_path).map_err(|e| e.to_string())?;
    // 词库总量不过几千条，统计直接复用查询（含同形词合并），比另写一套 COUNT 更不易走偏
    db::query(&con, &filter, None)
        .map(|v| v.len())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn export_document(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    filter: db::Filter,
    spec: content::Spec,
    // pdf / docx
    format: Option<String>,
    dir: Option<String>,
) -> Result<ExportResult, String> {
    let con = db::open(&state.db_path).map_err(|e| e.to_string())?;
    let mut entries = db::query(&con, &filter, None).map_err(|e| e.to_string())?;
    if entries.is_empty() {
        return Err("筛选结果为空，没有可出的题".into());
    }
    // 句子 / 选词填空离不开例句，先剔除没有例句的词条
    if matches!(spec.mode, content::Mode::Sentence | content::Mode::Cloze) {
        entries.retain(|e| !e.examples.is_empty());
        if entries.is_empty() {
            return Err("选中的词都没有例句，无法出句子题。可以改用其他题型，或缩小范围。".into());
        }
    }
    if spec.mode == content::Mode::Columns && spec.fields.is_empty() {
        return Err("请至少选择一列".into());
    }
    let docx = format.as_deref() == Some("docx");
    let bytes = if docx {
        docx::render(&entries, &spec)?
    } else {
        pdf::render(&entries, &spec)?
    };

    let name = file_name(spec.mode, docx);
    let size = bytes.len() as u64;
    let count = entries.len();

    // Android：先写进应用沙盒，再交给 MediaStore 落到公共下载目录。
    // 直接写公共路径在 Android 10+ 会被 scoped storage 拒绝。
    #[cfg(target_os = "android")]
    {
        let _ = &dir;
        let tmp_dir = app
            .path()
            .app_cache_dir()
            .map_err(|e| format!("取缓存目录失败：{e}"))?;
        std::fs::create_dir_all(&tmp_dir).map_err(|e| format!("建缓存目录失败：{e}"))?;
        let tmp = tmp_dir.join(&name);
        std::fs::write(&tmp, &bytes).map_err(|e| format!("写入临时文件失败：{e}"))?;

        let saved = app.save_share().save_file(SaveFileArgs {
            path: tmp.to_string_lossy().to_string(),
            file_name: name.clone(),
            mime: mime_of(docx).into(),
        })?;
        // 临时文件用完就删，公共目录那份才是给用户的
        let _ = std::fs::remove_file(&tmp);

        return Ok(ExportResult {
            path: saved.uri.clone(),
            display_path: saved.display_path,
            uri: saved.uri,
            count,
            file_name: name,
            size,
        });
    }

    #[cfg(not(target_os = "android"))]
    {
        let out_dir = match dir {
            Some(d) if !d.trim().is_empty() => PathBuf::from(d),
            _ => default_dir(&app),
        };
        std::fs::create_dir_all(&out_dir).map_err(|e| format!("无法创建目录 {out_dir:?}: {e}"))?;
        let path = out_dir.join(&name);
        std::fs::write(&path, &bytes).map_err(|e| format!("写入失败 {path:?}: {e}"))?;

        let display = path.to_string_lossy().to_string();
        Ok(ExportResult {
            path: display.clone(),
            display_path: display,
            uri: String::new(),
            count,
            file_name: name,
            size,
        })
    }
}

fn mime_of(docx: bool) -> &'static str {
    if docx {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    } else {
        "application/pdf"
    }
}

/// 用系统默认应用打开导出的文件（Android 上走 content:// URI）。
#[tauri::command]
fn open_exported(
    app: tauri::AppHandle,
    uri: String,
    format: Option<String>,
) -> Result<(), String> {
    let docx = format.as_deref() == Some("docx");
    #[cfg(target_os = "android")]
    {
        app.save_share().open(uri, mime_of(docx).into())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, uri);
        Err("桌面端请用「打开文件」按钮".into())
    }
}

/// 调起系统分享面板。只有 Android 有这一套，其它平台返回不支持。
#[tauri::command]
fn share_file(
    app: tauri::AppHandle,
    uri: String,
    format: Option<String>,
) -> Result<(), String> {
    let docx = format.as_deref() == Some("docx");
    #[cfg(target_os = "android")]
    {
        app.save_share().share(tauri_plugin_save_share::ShareArgs {
            uri,
            mime: mime_of(docx).into(),
            title: Some("分享试卷".into()),
        })
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, uri);
        Err("桌面端请直接用「打开文件」".into())
    }
}

fn default_dir(app: &tauri::AppHandle) -> PathBuf {
    // 桌面优先 Downloads；Android 的 Downloads 受分区存储限制，退回应用私有目录。
    if let Ok(d) = app.path().download_dir() {
        let cand = d.join("Easy Words");
        if std::fs::create_dir_all(&cand).is_ok() && writable(&cand) {
            return cand;
        }
    }
    let fallback = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("exports");
    let _ = std::fs::create_dir_all(&fallback);
    fallback
}

fn writable(dir: &std::path::Path) -> bool {
    let probe = dir.join(".probe");
    if std::fs::write(&probe, b"1").is_err() {
        return false;
    }
    let _ = std::fs::remove_file(&probe);
    true
}

fn file_name(mode: content::Mode, docx: bool) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let stamp = format!(
        "{}-{:02}-{:02}-{:02}{:02}",
        // 简易本地化：UTC+8，够用
        1970 + (secs + 8 * 3600) / 31_556_952,
        ((secs + 8 * 3600) % 31_556_952) / 2_629_746 + 1,
        ((secs + 8 * 3600) % 2_629_746) / 86_400 + 1,
        ((secs + 8 * 3600) % 86_400) / 3600,
        ((secs + 8 * 3600) % 3600) / 60,
    );
    let tag = match mode {
        content::Mode::Columns => "columns",
        content::Mode::Sentence => "sentence",
        content::Mode::Cloze => "cloze",
        content::Mode::Notes => "notes",
    };
    let ext = if docx { "docx" } else { "pdf" };
    format!("easywords-{tag}-{stamp}.{ext}")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_save_share::init())
        .setup(|app| {
            let path = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join("easywords.sqlite");
            db::ensure_db(&path)?;
            app.manage(AppState { db_path: path });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            catalog,
            preview,
            count_entries,
            export_document,
            share_file,
            open_exported
        ])
        .run(tauri::generate_context!())
        .expect("启动失败");
}
