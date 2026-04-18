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

define_windows_service!(ffi_service_main, my_service_main);

fn main() -> windows_service::Result<()> {
    service_dispatcher::start("PingPalWGEngine", ffi_service_main)?;
    Ok(())
}

fn my_service_main(_arguments: Vec<OsString>) {
    if let Err(_e) = run_service(_arguments) {
    }
}

fn run_service(_arguments: Vec<OsString>) -> windows_service::Result<()> {
    let (shutdown_tx, shutdown_rx) = channel();

    let event_handler = move |control_event| -> ServiceControlHandlerResult {
        match control_event {
            ServiceControl::Stop | ServiceControl::Interrogate => {
                let _ = shutdown_tx.send(());
                ServiceControlHandlerResult::NoError
            }
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    };

    let status_handle = service_control_handler::register("PingPalWGEngine", event_handler)?;

    status_handle.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Running,
        controls_accepted: ServiceControlAccept::STOP,
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    })?;

    let args: Vec<String> = std::env::args().collect();

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
        "PingPalWGEngine".to_string()
    };

    let mut child: Option<Child> = None;

    let log_path = std::env::temp_dir().join("pingpal_service.log");

    let log = |msg: &str| {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            let _ = writeln!(f, "[PingPalService] {}", msg);
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

    let _ = shutdown_rx.recv();
    log("Received stop signal");

    if let Some(mut c) = child {
        log("Killing child process");
        let _ = c.kill();
        let _ = c.wait();
    }
    log("Service stopping");

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
