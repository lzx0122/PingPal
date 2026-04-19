#[cfg(debug_assertions)]
pub fn init_dev_monitor(app_handle: tauri::AppHandle) {
    use sysinfo::System;
    use tauri::Emitter;
    use std::time::Duration;

    tauri::async_runtime::spawn(async move {
        // We only instantiate this heavy tracker in Dev mode
        let mut sys = System::new_all();
        // Give sysinfo a moment to establish baseline
        tokio::time::sleep(Duration::from_millis(500)).await;

        let pid = sysinfo::Pid::from_u32(std::process::id());
        
        loop {
            // sysinfo > 0.30 removed specific update params, usually just refresh_all or refresh_specifics
            sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
            sys.refresh_cpu_usage();
            sys.refresh_memory();

            let sys_cpu = sys.global_cpu_usage();
            let sys_mem = sys.used_memory();
            let sys_total_mem = sys.total_memory();

            let mut app_cpu = 0.0;
            let mut app_mem = 0;
            if let Some(process) = sys.process(pid) {
                app_cpu = process.cpu_usage();
                app_mem = process.memory();
            }

            let metrics = serde_json::json!({
                "sys_cpu": sys_cpu,
                "sys_mem": sys_mem,
                "sys_total_mem": sys_total_mem,
                "app_cpu": app_cpu,
                "app_mem": app_mem
            });

            if let Err(e) = app_handle.emit("dev-metrics", metrics) {
                tracing::warn!("Failed to emit dev-metrics: {}", e);
            }

            // Polling every 1 second is enough for a HUD
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });
}
