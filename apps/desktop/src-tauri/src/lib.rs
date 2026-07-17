use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

struct BridgeProcess(Mutex<Option<Child>>);

fn find_node() -> String {
    if let Ok(p) = std::env::var("GRODEX_NODE") {
        return p;
    }
    for cand in ["/opt/homebrew/bin/node", "/usr/local/bin/node"] {
        if std::path::Path::new(cand).exists() {
            return cand.to_string();
        }
    }
    "node".to_string()
}

fn bridge_entry(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let dev = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../bridge/src/index.ts");
    if dev.exists() {
        return Some(dev);
    }
    if let Ok(dir) = app.path().resource_dir() {
        let bundled = dir.join("bridge/index.js");
        if bundled.exists() {
            return Some(bundled);
        }
    }
    None
}

fn start_bridge(app: &tauri::AppHandle) -> Result<(), String> {
    let entry = bridge_entry(app).ok_or_else(|| {
        "bridge entry not found (expected apps/bridge/src/index.ts)".to_string()
    })?;
    let node = find_node();
    let apps_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let tsx = apps_root.join("node_modules/.bin/tsx");
    let runner = if tsx.exists() {
        tsx
    } else {
        std::path::PathBuf::from("npx")
    };

    let mut cmd = if runner.ends_with("tsx") {
        let mut c = Command::new(&node);
        c.arg(&runner).arg(&entry);
        c
    } else {
        let mut c = Command::new("npx");
        c.arg("tsx").arg(&entry);
        c
    };

    cmd.current_dir(&apps_root)
        .env("GRODEX_BRIDGE_PORT", "8790")
        .env("GRODEX_BRIDGE_HOST", "127.0.0.1")
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let child = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn bridge ({node}): {e}"))?;

    if let Some(state) = app.try_state::<BridgeProcess>() {
        *state.0.lock().unwrap() = Some(child);
    }
    Ok(())
}

fn stop_bridge(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<BridgeProcess>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BridgeProcess(Mutex::new(None)))
        .setup(|app| {
            if let Err(e) = start_bridge(app.handle()) {
                eprintln!("[grodex-desktop] {e}");
            } else {
                eprintln!("[grodex-desktop] bridge started on 127.0.0.1:8790");
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if matches!(event, RunEvent::Exit) {
                stop_bridge(app_handle);
            }
        });
}
