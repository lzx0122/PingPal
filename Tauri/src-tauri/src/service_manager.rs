use std::process::Command;

const SERVICE_NAME: &str = "NigPingWGEngine";
#[allow(dead_code)]
const SERVICE_DISPLAY_NAME: &str = "NigPing WireGuard Engine";

fn sc_output_combined(stdout: &str, stderr: &str) -> String {
    format!("{} {}", stdout, stderr)
}

/// True if sc output indicates the service is already running (locale-agnostic hints).
fn sc_says_already_running(stdout: &str, stderr: &str) -> bool {
    let c = sc_output_combined(stdout, stderr).to_lowercase();
    c.contains("1056")
        || (c.contains("already") && c.contains("run"))
        || c.contains("already been started")
}

/// True if stop was a no-op because the service is not running.
fn sc_says_not_running(stdout: &str, stderr: &str) -> bool {
    let c = sc_output_combined(stdout, stderr).to_lowercase();
    c.contains("1062") || c.contains("has not been started") || c.contains("not been started")
}

/// True if delete/query indicates the service does not exist.
fn sc_says_service_missing(stdout: &str, stderr: &str) -> bool {
    let c = sc_output_combined(stdout, stderr).to_lowercase();
    c.contains("1060") || c.contains("does not exist as an installed service")
}

/// Create a Windows service for WireGuard engine
pub fn create_service(
    wrapper_path: &str,
    engine_path: &str,
    adapter_name: &str,
) -> Result<(), String> {
    if service_exists()? {
        tracing::debug!("service already exists; skip create");
        return Ok(());
    }

    tracing::debug!("creating Windows service");

    let bin_path = format!(
        "\"{}\" \"{}\" \"{}\"",
        wrapper_path, engine_path, adapter_name
    );

    let create_args = [
        "create",
        SERVICE_NAME,
        &format!("binPath={}", bin_path),
        "start=demand",
        "DisplayName=NigPing WireGuard Engine",
    ];

    tracing::debug!(?create_args, "sc.exe create");

    let output = Command::new("sc.exe")
        .args(create_args)
        .output()
        .map_err(|e| format!("sc.exe create failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    tracing::trace!(%stdout, %stderr, code = ?output.status.code(), "sc.exe create output");

    if !output.status.success() {
        return Err(format!(
            "create service failed: stdout={} stderr={}",
            stdout, stderr
        ));
    }

    tracing::debug!("service created");
    Ok(())
}

/// Start the Windows service
pub fn start_service() -> Result<(), String> {
    tracing::debug!("starting Windows service");

    let output = Command::new("sc.exe")
        .args(["start", SERVICE_NAME])
        .output()
        .map_err(|e| format!("sc.exe start failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    tracing::trace!(%stdout, %stderr, code = ?output.status.code(), "sc.exe start output");

    if !output.status.success() {
        if sc_says_already_running(&stdout, &stderr) {
            tracing::debug!("service already running");
            return Ok(());
        }

        return Err(format!(
            "start service failed: stdout={} stderr={}",
            stdout, stderr
        ));
    }

    tracing::debug!("service start issued");
    Ok(())
}

/// Stop the Windows service
pub fn stop_service() -> Result<(), String> {
    tracing::debug!("stopping Windows service");

    let output = Command::new("sc.exe")
        .args(["stop", SERVICE_NAME])
        .output()
        .map_err(|e| format!("sc stop failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);

        if sc_says_not_running(&stdout, &stderr) {
            tracing::debug!("service was not running");
            return Ok(());
        }

        return Err(format!("stop service failed: {} {}", stdout, stderr));
    }

    tracing::debug!("service stopped");
    Ok(())
}

/// Delete the Windows service
#[allow(dead_code)]
pub fn delete_service() -> Result<(), String> {
    tracing::debug!("deleting Windows service");

    let _ = stop_service();

    std::thread::sleep(std::time::Duration::from_millis(500));

    let output = Command::new("sc.exe")
        .args(["delete", SERVICE_NAME])
        .output()
        .map_err(|e| format!("sc delete failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);

        if sc_says_service_missing(&stdout, &stderr) {
            tracing::debug!("service did not exist");
            return Ok(());
        }

        return Err(format!("delete service failed: {} {}", stdout, stderr));
    }

    tracing::debug!("service deleted");
    Ok(())
}

/// Check if service exists
pub fn service_exists() -> Result<bool, String> {
    let output = Command::new("sc.exe")
        .args(["query", SERVICE_NAME])
        .output()
        .map_err(|e| format!("sc query failed: {}", e))?;

    Ok(output.status.success())
}

/// Wait for service to be running
pub fn wait_for_service_running(timeout_secs: u64) -> Result<(), String> {
    let start = std::time::Instant::now();

    while start.elapsed().as_secs() < timeout_secs {
        let output = Command::new("sc.exe")
            .args(["query", SERVICE_NAME])
            .output()
            .map_err(|e| format!("sc query failed: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains("RUNNING") {
                tracing::debug!("service is RUNNING");
                return Ok(());
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    Err(format!(
        "timed out after {}s waiting for service to start",
        timeout_secs
    ))
}
