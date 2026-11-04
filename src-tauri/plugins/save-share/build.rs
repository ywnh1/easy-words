const COMMANDS: &[&str] = &["save_file", "share", "open"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
