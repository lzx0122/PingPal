use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("failed to read hostname: {0}")]
    Hostname(#[from] std::io::Error),
    #[error("device name is not valid UTF-8")]
    InvalidHostnameEncoding,
    #[error("already monitoring a process")]
    AlreadyMonitoring,
    #[error("process '{0}' was not found; start the game first")]
    ProcessNotFound(String),
    #[error("no active monitoring session")]
    NoActiveMonitoring,
    #[error("{0}")]
    Msg(String),
}

pub fn to_cmd_err(e: AppError) -> String {
    e.to_string()
}
