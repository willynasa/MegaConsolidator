use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppConfig {
    pub config: Value,
}

fn get_config_path(app: &AppHandle) -> std::path::PathBuf {
    // In Tauri v2, app_config_dir maps to AppData/Roaming/identifier on Windows
    let mut path = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    fs::create_dir_all(&path).unwrap_or(());
    path.push("settings.json");
    path
}

#[tauri::command]
pub fn load_config(app: AppHandle) -> Result<Value, String> {
    let path = get_config_path(&app);
    if path.exists() {
        let data = fs::read_to_string(path).map_err(|e| e.to_string())?;
        let json: Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        Ok(json)
    } else {
        Ok(serde_json::json!(null))
    }
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: Value) -> Result<(), String> {
    let path = get_config_path(&app);
    let data = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())?;
    Ok(())
}
