//! 导出文件的落地与分享。
//!
//! 为什么必须自己写：Android 10 起 scoped storage 生效，Rust 直接往
//! `/storage/emulated/0/Download/` 写会被拒绝；写到 app 私有目录用户
//! 在文件管理器里根本看不到。唯一正确的做法是走 MediaStore，
//! 这必须调用 Java API。
//!
//! 桌面端不需要插件，Rust 直接复制文件就够 —— 所以这些命令只在
//! Android 上转发给 Kotlin，其它平台由调用方（lib.rs）自己处理。

use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime, State};

#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;

// Serialize 是必需的：run_mobile_plugin 要把参数序列化成 JSON 转给 Kotlin。
// 这段代码只在 android 下编译，桌面 cargo check 看不到，容易漏。
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileArgs {
    /// 待保存的源文件绝对路径（应用沙盒内的临时文件）
    pub path: String,
    /// 目标文件名，例如 easywords-columns-2026-11-04.pdf
    pub file_name: String,
    /// MIME 类型，Android 靠它决定用哪个应用打开
    pub mime: String,
}

// 返回值要从 Kotlin 反序列化回来，所以同时要 Deserialize
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileResult {
    /// 系统展示给用户的位置，例如「下载/Easy Words」
    pub display_path: String,
    /// 可用于分享 / 打开的 content:// URI
    pub uri: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareArgs {
    pub uri: String,
    pub mime: String,
    /// 分享面板的标题
    pub title: Option<String>,
}

/// 拿着原生插件句柄的封装。
pub struct SaveShare<R: Runtime> {
    #[cfg(target_os = "android")]
    handle: PluginHandle<R>,
    #[cfg(not(target_os = "android"))]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> SaveShare<R> {
    #[cfg(target_os = "android")]
    pub fn save_file(&self, args: SaveFileArgs) -> Result<SaveFileResult, String> {
        self.handle
            .run_mobile_plugin::<SaveFileResult>("save_file", args)
            .map_err(|e| e.to_string())
    }

    #[cfg(target_os = "android")]
    pub fn share(&self, args: ShareArgs) -> Result<(), String> {
        self.handle
            .run_mobile_plugin::<()>("share", args)
            .map_err(|e| e.to_string())
    }

    #[cfg(target_os = "android")]
    pub fn open(&self, uri: String, mime: String) -> Result<(), String> {
        self.handle
            .run_mobile_plugin::<()>("open", ShareArgs { uri, mime, title: None })
            .map_err(|e| e.to_string())
    }

    /// 非 Android 平台不该调到这里，调到了说明上层判断有误。
    #[cfg(not(target_os = "android"))]
    pub fn save_file(&self, _args: SaveFileArgs) -> Result<SaveFileResult, String> {
        Err("save_file 只在 Android 上可用".into())
    }

    #[cfg(not(target_os = "android"))]
    pub fn share(&self, _args: ShareArgs) -> Result<(), String> {
        Err("share 只在 Android 上可用".into())
    }

    #[cfg(not(target_os = "android"))]
    pub fn open(&self, _uri: String, _mime: String) -> Result<(), String> {
        Err("open 只在 Android 上可用".into())
    }

    pub fn is_android(&self) -> bool {
        cfg!(target_os = "android")
    }
}

pub trait SaveShareExt<R: Runtime> {
    fn save_share(&self) -> State<'_, SaveShare<R>>;
}

impl<R: Runtime, T: tauri::Manager<R>> SaveShareExt<R> for T {
    fn save_share(&self) -> State<'_, SaveShare<R>> {
        self.state::<SaveShare<R>>()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("save-share")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle = api.register_android_plugin("com.ywnh1.saveshare", "SaveSharePlugin")?;
                app.manage(SaveShare { handle });
            }
            #[cfg(not(target_os = "android"))]
            {
                let _ = api;
                app.manage(SaveShare::<R> {
                    _marker: std::marker::PhantomData,
                });
            }
            Ok(())
        })
        .build()
}
