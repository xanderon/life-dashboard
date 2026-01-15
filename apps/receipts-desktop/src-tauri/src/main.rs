#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::api::path::{home_dir, resource_dir};
use tauri::api::shell;
use tauri::{Env, Manager, PackageInfo};

const DEFAULT_RECEIPTS_ROOT: &str = "Dropbox/bonuri";
const STATE_DIR: &str = ".life-dashboard/receipts-desktop";
const STATE_FILE: &str = "state.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
struct StoreConfig {
  id: String,
  name: String,
  enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AppConfig {
  receipts_root: String,
  worker_dir: Option<String>,
  worker_run_cmd: Option<String>,
  stores: Vec<StoreConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct InboxCount {
  store_id: String,
  count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct StoreSeenState {
  last_seen_failure_run_id: Option<String>,
  last_seen_warning_run_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct SeenState {
  stores: HashMap<String, StoreSeenState>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct UnreadBadge {
  store_id: String,
  warnings_unread: bool,
  failures_unread: bool,
  last_warning_run_id: Option<String>,
  last_failure_run_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct RunWorkerResult {
  status: String,
  exit_code: Option<i32>,
  stdout: String,
  stderr: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct WorkerLogEvent {
  stream: String,
  line: String,
  stores: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct UpdateStatus {
  status: String,
  installed_version: String,
  source_version: Option<String>,
  source_path: Option<String>,
  message: Option<String>,
}

fn default_receipts_root() -> String {
  if let Some(home) = home_dir() {
    return home.join(DEFAULT_RECEIPTS_ROOT).to_string_lossy().to_string();
  }
  DEFAULT_RECEIPTS_ROOT.to_string()
}

fn env_var(key: &str) -> Option<String> {
  std::env::var(key).ok().filter(|value| !value.trim().is_empty())
}

fn load_stores_config(package_env: Option<(&PackageInfo, &Env)>) -> Vec<StoreConfig> {
  let mut paths = Vec::new();
  if let Some(custom) = env_var("RECEIPTS_STORES_PATH") {
    paths.push(PathBuf::from(custom));
  }
  if let Ok(current) = std::env::current_dir() {
    paths.push(current.join("config").join("stores.json"));
    paths.push(current.join("..").join("config").join("stores.json"));
  }
  if let Some((package_info, env)) = package_env {
    if let Some(resource_base) = resource_dir(package_info, env) {
      paths.push(resource_base.join("stores.json"));
    }
  }

  for path in paths {
    if path.exists() {
      if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(stores) = serde_json::from_str::<Vec<StoreConfig>>(&raw) {
          return stores;
        }
      }
    }
  }

  vec![
    StoreConfig {
      id: "lidl".to_string(),
      name: "Lidl".to_string(),
      enabled: true,
    },
    StoreConfig {
      id: "kaufland".to_string(),
      name: "Kaufland".to_string(),
      enabled: false,
    },
    StoreConfig {
      id: "carrefour".to_string(),
      name: "Carrefour".to_string(),
      enabled: false,
    },
  ]
}

fn read_app_config(package_env: Option<(&PackageInfo, &Env)>) -> AppConfig {
  AppConfig {
    receipts_root: env_var("RECEIPTS_ROOT").unwrap_or_else(default_receipts_root),
    worker_dir: env_var("WORKER_DIR"),
    worker_run_cmd: env_var("WORKER_RUN_CMD"),
    stores: load_stores_config(package_env),
  }
}

fn default_source_dir() -> Option<PathBuf> {
  let home = home_dir()?;
  Some(
    home
      .join("Documents")
      .join("Github repos")
      .join("life-dashboard")
      .join("apps")
      .join("receipts-desktop"),
  )
}

fn resolve_source_dir() -> Option<PathBuf> {
  if let Some(custom) = env_var("RECEIPTS_APP_SOURCE") {
    let path = PathBuf::from(custom);
    if path.exists() {
      return Some(path);
    }
  }
  let fallback = default_source_dir();
  if let Some(path) = fallback.clone() {
    if path.exists() {
      return Some(path);
    }
  }
  None
}

fn read_source_version(source_dir: &Path) -> Result<String, String> {
  let path = source_dir.join("src-tauri").join("tauri.conf.json");
  let raw = fs::read_to_string(&path).map_err(|err| err.to_string())?;
  let value: Value = serde_json::from_str(&raw).map_err(|err| err.to_string())?;
  value
    .get("package")
    .and_then(|pkg| pkg.get("version"))
    .and_then(|ver| ver.as_str())
    .map(|ver| ver.to_string())
    .ok_or_else(|| "Missing package.version in tauri.conf.json".to_string())
}

fn state_file_path() -> Option<PathBuf> {
  let home = home_dir()?;
  Some(home.join(STATE_DIR).join(STATE_FILE))
}

fn load_state() -> SeenState {
  if let Some(path) = state_file_path() {
    if let Ok(raw) = fs::read_to_string(path) {
      if let Ok(state) = serde_json::from_str(&raw) {
        return state;
      }
    }
  }
  SeenState::default()
}

fn save_state(state: &SeenState) -> Result<(), String> {
  let path = state_file_path().ok_or("Missing home directory")?;
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|err| err.to_string())?;
  }
  let raw = serde_json::to_string_pretty(state).map_err(|err| err.to_string())?;
  fs::write(path, raw).map_err(|err| err.to_string())?;
  Ok(())
}

fn list_run_summaries(receipts_root: &str) -> Vec<(Value, Option<std::time::SystemTime>)> {
  let runs_dir = Path::new(receipts_root).join("_logs").join("runs");
  let mut summaries = Vec::new();
  let entries = match fs::read_dir(runs_dir) {
    Ok(entries) => entries,
    Err(_) => return summaries,
  };

  for entry in entries.flatten() {
    let path = entry.path();
    if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
      continue;
    }
    if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
      if !name.ends_with(".summary.json") {
        continue;
      }
    }

    if let Ok(raw) = fs::read_to_string(&path) {
      if let Ok(value) = serde_json::from_str::<Value>(&raw) {
        let modified = entry.metadata().and_then(|meta| meta.modified()).ok();
        summaries.push((value, modified));
      }
    }
  }

  summaries
}

fn extract_run_id(value: &Value) -> Option<String> {
  value
    .get("run_id")
    .and_then(|id| id.as_str())
    .map(|id| id.to_string())
}

fn extract_stores(value: &Value) -> Vec<String> {
  value
    .get("stores")
    .and_then(|stores| stores.as_array())
    .map(|arr| {
      arr
        .iter()
        .filter_map(|item| item.as_str().map(|s| s.to_string()))
        .collect()
    })
    .unwrap_or_default()
}

fn extract_has_issues(value: &Value, key: &str) -> bool {
  value
    .get(key)
    .and_then(|entries| entries.as_array())
    .map(|arr| !arr.is_empty())
    .unwrap_or(false)
}

fn latest_issue_runs(summaries: &[Value]) -> HashMap<String, (Option<String>, Option<String>)> {
  let mut map: HashMap<String, (Option<String>, Option<String>)> = HashMap::new();

  for summary in summaries {
    let run_id = match extract_run_id(summary) {
      Some(id) => id,
      None => continue,
    };
    let stores = extract_stores(summary);
    let has_failures = extract_has_issues(summary, "failures");
    let has_warnings = extract_has_issues(summary, "warnings");

    for store in stores {
      let entry = map.entry(store).or_insert((None, None));
      if has_failures {
        if entry
          .0
          .as_deref()
          .map(|prev| run_id.as_str() > prev)
          .unwrap_or(true)
        {
          entry.0 = Some(run_id.clone());
        }
      }
      if has_warnings {
        if entry
          .1
          .as_deref()
          .map(|prev| run_id.as_str() > prev)
          .unwrap_or(true)
        {
          entry.1 = Some(run_id.clone());
        }
      }
    }
  }

  map
}

#[tauri::command]
fn get_config(app: tauri::AppHandle) -> AppConfig {
  read_app_config(Some((app.package_info(), &app.env())))
}

#[tauri::command]
fn get_inbox_counts() -> Result<Vec<InboxCount>, String> {
  let config = read_app_config(None);
  let mut results = Vec::new();
  for store in config.stores {
    let inbox_path = Path::new(&config.receipts_root)
      .join("inbox")
      .join(&store.id);
    let mut count = 0usize;
    if let Ok(entries) = fs::read_dir(inbox_path) {
      for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
          continue;
        }
        if let Some(ext) = path.extension().and_then(|ext| ext.to_str()) {
          let ext = ext.to_lowercase();
          if ext == "png" || ext == "jpg" || ext == "jpeg" || ext == "pdf" {
            count += 1;
          }
        }
      }
    }
    results.push(InboxCount {
      store_id: store.id,
      count,
    });
  }
  Ok(results)
}

#[tauri::command]
fn get_last_runs(limit: Option<usize>) -> Result<Vec<Value>, String> {
  let config = read_app_config(None);
  let mut summaries = list_run_summaries(&config.receipts_root);
  summaries.sort_by(|a, b| b.1.cmp(&a.1));

  let capped = summaries
    .into_iter()
    .map(|(value, _)| value)
    .take(limit.unwrap_or(5))
    .collect::<Vec<_>>();
  Ok(capped)
}

#[tauri::command]
fn get_unread_badges() -> Result<Vec<UnreadBadge>, String> {
  let config = read_app_config(None);
  let summaries = list_run_summaries(&config.receipts_root)
    .into_iter()
    .map(|(value, _)| value)
    .collect::<Vec<_>>();
  let latest_map = latest_issue_runs(&summaries);
  let state = load_state();

  let mut badges = Vec::new();
  for store in config.stores {
    let seen = state.stores.get(&store.id).cloned().unwrap_or_default();
    let (latest_failure, latest_warning) = latest_map
      .get(&store.id)
      .cloned()
      .unwrap_or((None, None));

    let failures_unread = latest_failure
      .as_deref()
      .and_then(|latest| {
        seen
          .last_seen_failure_run_id
          .as_deref()
          .map(|seen_id| latest > seen_id)
          .or(Some(true))
      })
      .unwrap_or(false);

    let warnings_unread = latest_warning
      .as_deref()
      .and_then(|latest| {
        seen
          .last_seen_warning_run_id
          .as_deref()
          .map(|seen_id| latest > seen_id)
          .or(Some(true))
      })
      .unwrap_or(false);

    badges.push(UnreadBadge {
      store_id: store.id,
      warnings_unread,
      failures_unread,
      last_warning_run_id: latest_warning,
      last_failure_run_id: latest_failure,
    });
  }

  Ok(badges)
}

#[tauri::command]
fn mark_store_badges_seen(store_id: String) -> Result<(), String> {
  let config = read_app_config(None);
  let summaries = list_run_summaries(&config.receipts_root)
    .into_iter()
    .map(|(value, _)| value)
    .collect::<Vec<_>>();
  let latest_map = latest_issue_runs(&summaries);
  let mut state = load_state();
  let latest = latest_map.get(&store_id).cloned().unwrap_or((None, None));
  let entry = state
    .stores
    .entry(store_id)
    .or_insert_with(StoreSeenState::default);
  entry.last_seen_failure_run_id = latest.0;
  entry.last_seen_warning_run_id = latest.1;
  save_state(&state)
}

#[tauri::command]
fn run_worker(
  window: tauri::Window,
  stores: Vec<String>,
  mode: String,
) -> Result<RunWorkerResult, String> {
  let config = read_app_config(None);
  let mut args: Vec<String> = Vec::new();
  if stores.is_empty() {
    args.push("--all".to_string());
  } else if stores.len() == 1 {
    args.push("--store".to_string());
    args.push(stores.join(","));
  } else {
    args.push("--stores".to_string());
    args.push(stores.join(","));
  }
  let _ = mode;

  if let Some(run_cmd) = config.worker_run_cmd {
    let mut command = Command::new(run_cmd);
    command.args(args);
    if let Some(worker_dir) = config.worker_dir {
      command.current_dir(worker_dir);
    }
    return run_command_stream(&window, command, stores, false);
  }

  let worker_dir = config
    .worker_dir
    .ok_or_else(|| "WORKER_DIR is not set".to_string())?;
  let mut python_path = Path::new(&worker_dir).join(".venv").join("bin").join("python");
  if !python_path.exists() {
    python_path = PathBuf::from("python3");
  }

  let mut command = Command::new(python_path);
  command
    .current_dir(worker_dir)
    .arg("-m")
    .arg("src.runner");

  if stores.is_empty() {
    command.arg("--all");
  } else if stores.len() == 1 {
    command.arg("--store").arg(stores.join(","));
  } else {
    command.arg("--stores").arg(stores.join(","));
  }
  let _ = mode;

  run_command_stream(&window, command, stores, false)
}

fn run_command_stream(
  window: &tauri::Window,
  mut command: Command,
  stores: Vec<String>,
  stderr_as_stdout: bool,
) -> Result<RunWorkerResult, String> {
  let mut child = command
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|err| err.to_string())?;

  let stdout = child.stdout.take().ok_or("Missing stdout")?;
  let stderr = child.stderr.take().ok_or("Missing stderr")?;

  let stdout_buffer = Arc::new(Mutex::new(String::new()));
  let stderr_buffer = Arc::new(Mutex::new(String::new()));

  let stdout_clone = stdout_buffer.clone();
  let stderr_clone = stderr_buffer.clone();
  let stores_clone = stores.clone();
  let window_stdout = window.clone();
  let window_stderr = window.clone();
  let stderr_to_stdout = stderr_as_stdout;

  let stdout_handle = thread::spawn(move || {
    let reader = BufReader::new(stdout);
    for line in reader.lines().flatten() {
      let _ = window_stdout.emit(
        "worker-log",
        WorkerLogEvent {
          stream: "stdout".to_string(),
          line: line.clone(),
          stores: stores_clone.clone(),
        },
      );
      if let Ok(mut buf) = stdout_clone.lock() {
        buf.push_str(&line);
        buf.push('\n');
      }
    }
  });

  let stderr_handle = thread::spawn(move || {
    let reader = BufReader::new(stderr);
    for line in reader.lines().flatten() {
      let stream_label = if stderr_to_stdout { "stdout" } else { "stderr" };
      let _ = window_stderr.emit(
        "worker-log",
        WorkerLogEvent {
          stream: stream_label.to_string(),
          line: line.clone(),
          stores: stores.clone(),
        },
      );
      if let Ok(mut buf) = stderr_clone.lock() {
        buf.push_str(&line);
        buf.push('\n');
      }
    }
  });

  let status = child.wait().map_err(|err| err.to_string())?;
  let _ = stdout_handle.join();
  let _ = stderr_handle.join();

  let stdout_text = stdout_buffer
    .lock()
    .map(|buf| buf.clone())
    .unwrap_or_default();
  let stderr_text = stderr_buffer
    .lock()
    .map(|buf| buf.clone())
    .unwrap_or_default();

  Ok(RunWorkerResult {
    status: if status.success() {
      "ok".to_string()
    } else {
      "fail".to_string()
    },
    exit_code: status.code(),
    stdout: stdout_text,
    stderr: stderr_text,
  })
}

#[tauri::command]
fn get_update_status(app: tauri::AppHandle) -> Result<UpdateStatus, String> {
  let installed_version = app.package_info().version.to_string();
  let source_dir = resolve_source_dir();

  if source_dir.is_none() {
    return Ok(UpdateStatus {
      status: "source_missing".to_string(),
      installed_version,
      source_version: None,
      source_path: None,
      message: Some("Source code not found. Set RECEIPTS_APP_SOURCE.".to_string()),
    });
  }

  let source_dir = source_dir.unwrap();
  let source_version = read_source_version(&source_dir)?;
  let status = if source_version == installed_version {
    "up_to_date"
  } else {
    "update_available"
  };

  Ok(UpdateStatus {
    status: status.to_string(),
    installed_version,
    source_version: Some(source_version),
    source_path: Some(source_dir.to_string_lossy().to_string()),
    message: None,
  })
}

#[tauri::command]
fn run_update(window: tauri::Window) -> Result<RunWorkerResult, String> {
  let source_dir = resolve_source_dir().ok_or_else(|| {
    "Source code not found. Set RECEIPTS_APP_SOURCE to the repo path.".to_string()
  })?;
  let script = source_dir.join("scripts").join("update.receipts.operator");
  if !script.exists() {
    return Err(format!("Update script not found: {}", script.to_string_lossy()));
  }

  let mut command = Command::new(script);
  command.current_dir(&source_dir);
  run_command_stream(&window, command, Vec::new(), true)
}

#[tauri::command]
fn open_path(
  window: tauri::Window,
  path_type: String,
  store_id: Option<String>,
  file_path: Option<String>,
) -> Result<(), String> {
  let config = read_app_config(None);
  let base = PathBuf::from(&config.receipts_root);
  let store_value = store_id.clone();
  let file_value = file_path.clone();
  let resolved = match path_type.as_str() {
    "inbox" => base.join("inbox").join(store_id.ok_or("store_id required")?),
    "processed" => base.join("processed").join(store_id.ok_or("store_id required")?),
    "failed" => base.join("failed").join(store_id.ok_or("store_id required")?),
    "logs" => base.join("_logs"),
    "logFile" => PathBuf::from(file_path.ok_or("file_path required")?),
    "errorFile" => PathBuf::from(file_path.ok_or("file_path required")?),
    _ => return Err("Unknown path type".to_string()),
  };

  println!(
    "open_path: type={}, store={:?}, file={:?}, resolved={}",
    path_type,
    store_value,
    file_value,
    resolved.to_string_lossy()
  );

  if !resolved.exists() {
    return Err(format!("Path not found: {}", resolved.to_string_lossy()));
  }

  match shell::open(
    &window.shell_scope(),
    resolved.to_string_lossy().to_string(),
    None,
  ) {
    Ok(()) => Ok(()),
    Err(err) => {
      let shell_error = err.to_string();
      println!("shell::open failed: {}", shell_error);
      open_with_system(&resolved)
        .map_err(|fallback| format!("open failed: {}; fallback: {}", shell_error, fallback))
    }
  }
}

fn open_with_system(path: &Path) -> Result<(), String> {
  #[cfg(target_os = "macos")]
  {
    let status = Command::new("open")
      .arg(path)
      .status()
      .map_err(|err| err.to_string())?;
    return if status.success() {
      Ok(())
    } else {
      Err(format!("open exited with status {}", status))
    };
  }
  #[cfg(target_os = "linux")]
  {
    let status = Command::new("xdg-open")
      .arg(path)
      .status()
      .map_err(|err| err.to_string())?;
    return if status.success() {
      Ok(())
    } else {
      Err(format!("xdg-open exited with status {}", status))
    };
  }
  #[cfg(target_os = "windows")]
  {
    let status = Command::new("cmd")
      .args(["/C", "start", "", &path.to_string_lossy()])
      .status()
      .map_err(|err| err.to_string())?;
    return if status.success() {
      Ok(())
    } else {
      Err(format!("cmd start exited with status {}", status))
    };
  }
  #[allow(unreachable_code)]
  Err("Unsupported platform for open".to_string())
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      get_config,
      get_inbox_counts,
      get_last_runs,
      get_unread_badges,
      run_worker,
      get_update_status,
      run_update,
      mark_store_badges_seen,
      open_path
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
