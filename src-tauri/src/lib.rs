mod db;
mod pdf;

use serde::Serialize;
use std::path::PathBuf;
use tauri::{Manager, State};

struct AppState {
    db_path: PathBuf,
}

#[derive(Serialize)]
pub struct ExportResult {
    pub path: String,
    pub count: usize,
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
fn export_pdf(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    filter: db::Filter,
    spec: pdf::Spec,
    dir: Option<String>,
) -> Result<ExportResult, String> {
    let con = db::open(&state.db_path).map_err(|e| e.to_string())?;
    let mut entries = db::query(&con, &filter, None).map_err(|e| e.to_string())?;
    if entries.is_empty() {
        return Err("筛选结果为空，没有可出的题".into());
    }
    if spec.kind == pdf::Kind::Blank {
        entries.retain(|e| !e.examples.is_empty());
        if entries.is_empty() {
            return Err("选中的词都没有例句，无法做句子默写。可以改用其他题型，或缩小范围。".into());
        }
    }
    let bytes = pdf::render(&entries, &spec)?;

    let out_dir = match dir {
        Some(d) if !d.trim().is_empty() => PathBuf::from(d),
        _ => default_dir(&app),
    };
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("无法创建目录 {out_dir:?}: {e}"))?;
    let path = out_dir.join(file_name(spec.kind));
    std::fs::write(&path, &bytes).map_err(|e| format!("写入失败 {path:?}: {e}"))?;

    Ok(ExportResult {
        path: path.to_string_lossy().to_string(),
        count: entries.len(),
    })
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

fn file_name(kind: pdf::Kind) -> String {
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
    let tag = match kind {
        pdf::Kind::Cn2En => "cn2en",
        pdf::Kind::En2Cn => "en2cn",
        pdf::Kind::Table => "wordlist",
        pdf::Kind::Blank => "blank",
    };
    format!("easywords-{tag}-{stamp}.pdf")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            export_pdf
        ])
        .run(tauri::generate_context!())
        .expect("启动失败");
}
