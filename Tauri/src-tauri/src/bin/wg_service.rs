use std::ffi::OsString;
use std::process::{Child, Command};
use std::sync::mpsc::channel;
use std::time::Duration;
use windows_service::{
    define_windows_service,
    service::{
        ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus,
        ServiceType,
    },
    service_control_handler::{self, ServiceControlHandlerResult},
    service_dispatcher,
};

// Define the service entry point
define_windows_service!(ffi_service_main, my_service_main);

fn main() -> windows_service::Result<()> {
    // Run the service dispatcher
    service_dispatcher::start("NigPingWGEngine", ffi_service_main)?;
    Ok(())
}

fn my_service_main(_arguments: Vec<OsString>) {
    if let Err(_e) = run_service(_arguments) {
        // Handle error in some way, maybe log to a file
    }
}

fn run_service(_arguments: Vec<OsString>) -> windows_service::Result<()> {
    // Create a channel to handle service events
    let (shutdown_tx, shutdown_rx) = channel();

    // Define the event handler
    let event_handler = move |control_event| -> ServiceControlHandlerResult {
        match control_event {
            ServiceControl::Stop | ServiceControl::Interrogate => {
                let _ = shutdown_tx.send(());
                ServiceControlHandlerResult::NoError
            }
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    };

    // Register the service control handler
    let status_handle = service_control_handler::register("NigPingWGEngine", event_handler)?;

    // Report Running state
    // We accept Stop commands
    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Running,
        controls_accepted: ServiceControlAccept::STOP,
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    })?;

    // --- Service Logic Starts Here ---

    // We expect the arguments to be passed via the binPath command line.
    // binPath = "path\to\wg_service.exe" "path\to\wg-engine.exe" "AdapterName"
    // So std::env::args() should look like: [exe, engine_path, adapter_name]

    let args: Vec<String> = std::env::args().collect();

    // Default fallback (useful for testing or if paths match expectations)
    let exe_path = std::env::current_exe().unwrap();
    let exe_dir = exe_path.parent().unwrap();

    let engine_path_str = if args.len() > 1 {
        args[1].clone()
    } else {
        exe_dir
            .join("wg-engine-x86_64-pc-windows-msvc.exe")
            .to_string_lossy()
            .to_string()
    };

    let adapter_name = if args.len() > 2 {
        args[2].clone()
    } else {
        "NigPingWGEngine".to_string()
    };

    // Spawn the actual wg-engine process
    // Command: wg-engine.exe <adapter_name>
    let mut child: Option<Child> = None;

    // Log file path (SYSTEM can write to Windows/Temp)
    let log_path = std::env::temp_dir().join("nigping_service.log");

    // Helper to log
    let log = |msg: &str| {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            let _ = writeln!(f, "[NigPingService] {}", msg);
        }
    };

    log(&format!(
        "Starting wrapper. Exe: {}, Engine: {}, Adapter: {}",
        exe_path.display(),
        engine_path_str,
        adapter_name
    ));

    match Command::new(&engine_path_str)
        .arg(&adapter_name)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => {
            log("Child spawned successfully");
            child = Some(c);
        }
        Err(e) => {
            log(&format!("Failed to spawn child: {}", e));
        }
    }

    // --- Wait for Stop Signal ---
    let _ = shutdown_rx.recv();
    log("Received stop signal");

    // --- Cleanup ---
    if let Some(mut c) = child {
        log("Killing child process");
        let _ = c.kill();
        let _ = c.wait();
    }
    log("Service stopping");

    // Report Stopped state
    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Stopped,
        controls_accepted: ServiceControlAccept::empty(),
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    })?;

    Ok(())
}
