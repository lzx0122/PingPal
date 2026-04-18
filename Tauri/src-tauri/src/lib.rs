mod dev_monitor;
mod error;
mod network_monitor;
mod privileges;
mod service_manager;
mod vpn;

use std::sync::Arc;
use tokio::sync::Mutex;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tracing::instrument(level = "info", skip(name), fields(name = %name))]
#[tauri::command]
fn greet(name: &str) -> String {
    tracing::info!("greet command invoked");
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn get_device_name_inner() -> Result<String, error::AppError> {
    hostname::get()
        .map_err(error::AppError::Hostname)?
        .into_string()
        .map_err(|_| error::AppError::InvalidHostnameEncoding)
}

#[tracing::instrument(level = "info", skip_all)]
#[tauri::command]
fn get_device_name() -> Result<String, String> {
    tracing::debug!("resolving device name");
    get_device_name_inner().map_err(error::to_cmd_err)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_span_events(tracing_subscriber::fmt::format::FmtSpan::CLOSE)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                tracing::info!("Initializing Dev Monitor HUD via sysinfo...");
                dev_monitor::init_dev_monitor(app.handle().clone());
            }
            Ok(())
        })
        .manage(Arc::new(Mutex::new(network_monitor::MonitorState::new())))
        .invoke_handler(tauri::generate_handler![
            greet,
            get_device_name,
            vpn::connect_vpn,
            vpn::disconnect_vpn,
            network_monitor::start_monitoring,
            network_monitor::get_detected_servers,
            network_monitor::get_all_session_ips,
            network_monitor::stop_monitoring,
            network_monitor::add_detected_ip_to_routes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
