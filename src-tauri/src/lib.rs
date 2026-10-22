use std::fs;
use tauri::{command, AppHandle, Manager};

#[command]
fn save_app_settings(app: AppHandle, settings: String) -> Result<(), String> {
  let app_dir = app
    .path()
    .app_data_dir()
    .map_err(|error| error.to_string())?;

  fs::create_dir_all(&app_dir).map_err(|error| error.to_string())?;
  let settings_path = app_dir.join("settings.json");
  fs::write(&settings_path, settings).map_err(|error| error.to_string())?;
  Ok(())
}

#[command]
fn load_app_settings(app: AppHandle) -> Result<String, String> {
  let app_dir = app
    .path()
    .app_data_dir()
    .map_err(|error| error.to_string())?;

  let settings_path = app_dir.join("settings.json");
  if !settings_path.exists() {
    return Ok(String::new());
  }

  fs::read_to_string(&settings_path).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![save_app_settings, load_app_settings])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
