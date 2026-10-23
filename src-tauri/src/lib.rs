use std::{
  collections::VecDeque,
  env, fs,
  sync::Mutex,
  time::{Duration, Instant},
};
use tauri::{command, AppHandle, Manager, State};

const FAL_ENDPOINT: &str = "decart/lucy-2-5/realtime";
const FAL_TOKEN_DURATION_SECONDS: u64 = 120;
const TOKEN_RATE_LIMIT: usize = 6;
const TOKEN_RATE_WINDOW: Duration = Duration::from_secs(60);

#[derive(Default)]
struct TokenRequestLimiter {
  requests: Mutex<VecDeque<Instant>>,
}

impl TokenRequestLimiter {
  fn check(&self) -> Result<(), String> {
    let now = Instant::now();
    let mut requests = self
      .requests
      .lock()
      .map_err(|_| "Token rate limiter is unavailable.".to_string())?;

    while requests
      .front()
      .is_some_and(|request| now.duration_since(*request) >= TOKEN_RATE_WINDOW)
    {
      requests.pop_front();
    }

    if requests.len() >= TOKEN_RATE_LIMIT {
      return Err("fal token requests are temporarily rate-limited. Try again shortly.".to_string());
    }

    requests.push_back(now);
    Ok(())
  }
}

#[derive(serde::Deserialize)]
struct FalTokenResponse {
  token: String,
}

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

#[command]
async fn create_fal_realtime_token(
  limiter: State<'_, TokenRequestLimiter>,
) -> Result<String, String> {
  let fal_key = env::var("FAL_KEY")
    .map_err(|_| "FAL_KEY is not set in the Tauri backend environment.".to_string())?;
  if fal_key.trim().is_empty() {
    return Err("FAL_KEY is empty in the Tauri backend environment.".to_string());
  }

  limiter.check()?;

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(10))
    .build()
    .map_err(|_| "Unable to initialize the fal token client.".to_string())?;
  let response = client
    .post("https://rest.fal.ai/tokens/realtime")
    .header("Authorization", format!("Key {fal_key}"))
    .json(&serde_json::json!({
      "allowed_apps": [FAL_ENDPOINT],
      "duration": FAL_TOKEN_DURATION_SECONDS,
    }))
    .send()
    .await
    .map_err(|_| "Could not reach fal to request a realtime token.".to_string())?;

  if !response.status().is_success() {
    return Err(format!(
      "fal rejected the realtime token request (HTTP {}). Check FAL_KEY and account access.",
      response.status()
    ));
  }

  let token_response = response
    .json::<FalTokenResponse>()
    .await
    .map_err(|_| "fal returned an invalid realtime token response.".to_string())?;
  if token_response.token.trim().is_empty() {
    return Err("fal returned an empty realtime token.".to_string());
  }

  Ok(token_response.token)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(TokenRequestLimiter::default())
    .invoke_handler(tauri::generate_handler![
      save_app_settings,
      load_app_settings,
      create_fal_realtime_token
    ])
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
