use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, LUID};
use windows_sys::Win32::Security::{
    AdjustTokenPrivileges, LookupPrivilegeValueW, LUID_AND_ATTRIBUTES, SE_PRIVILEGE_ENABLED,
    TOKEN_ADJUST_PRIVILEGES, TOKEN_PRIVILEGES, TOKEN_QUERY,
};
use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

fn enable_privilege(privilege_name: &str, token_handle: isize) -> Result<(), String> {
    unsafe {
        let mut luid: LUID = std::mem::zeroed();
        let name_wide: Vec<u16> = OsStr::new(privilege_name)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        if LookupPrivilegeValueW(std::ptr::null(), name_wide.as_ptr(), &mut luid) == 0 {
            return Err(format!(
                "LookupPrivilegeValueW failed for {}: {}",
                privilege_name,
                GetLastError()
            ));
        }

        let mut token_privileges = TOKEN_PRIVILEGES {
            PrivilegeCount: 1,
            Privileges: [LUID_AND_ATTRIBUTES {
                Luid: luid,
                Attributes: SE_PRIVILEGE_ENABLED,
            }],
        };

        if AdjustTokenPrivileges(
            token_handle,
            0,
            &mut token_privileges,
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        ) == 0
        {
            return Err(format!(
                "AdjustTokenPrivileges failed for {}: {}",
                privilege_name,
                GetLastError()
            ));
        }

        let err = GetLastError();
        if err != 0 {
            // 1300 = ERROR_NOT_ALL_ASSIGNED
            if err == 1300 {
                return Err(format!(
                    "{}: ERROR_NOT_ALL_ASSIGNED (privilege not granted)",
                    privilege_name
                ));
            }
        }
    }

    Ok(())
}

pub fn enable_se_restore_privilege() -> Result<(), String> {
    unsafe {
        let mut token_handle = 0;
        let process_handle = GetCurrentProcess();

        if OpenProcessToken(
            process_handle,
            TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
            &mut token_handle,
        ) == 0
        {
            return Err(format!("OpenProcessToken failed: {}", GetLastError()));
        }

        let required_privileges = [
            "SeRestorePrivilege",
            "SeBackupPrivilege",
            "SeCreateSymbolicLinkPrivilege",
            "SeSecurityPrivilege",
        ];

        let mut errors = Vec::new();
        let mut success_count = 0;

        for privilege in &required_privileges {
            match enable_privilege(privilege, token_handle) {
                Ok(_) => {
                    tracing::debug!(%privilege, "privilege enabled");
                    success_count += 1;
                }
                Err(e) => {
                    tracing::warn!(%privilege, error = %e, "failed to enable privilege");
                    errors.push(format!("{}: {}", privilege, e));
                }
            }
        }

        CloseHandle(token_handle);

        if success_count == 0 {
            return Err(format!(
                "failed to enable any privilege:\n{}",
                errors.join("\n")
            ));
        }

        if !errors.is_empty() {
            tracing::warn!(
                failed = errors.len(),
                ok = success_count,
                "some privileges failed; continuing with partial success"
            );
        }

        Ok(())
    }
}
