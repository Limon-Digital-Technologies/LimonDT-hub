#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_installed_apps,
            install_app,
            launch_app,
            uninstall_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running Limon Digital Tech. Hub");
}

#[tauri::command]
fn get_installed_apps() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        return Ok(if calculator_install_dir()?.is_some() {
            vec!["calculator".to_string()]
        } else {
            Vec::new()
        });
    }

    #[cfg(not(target_os = "windows"))]
    Ok(Vec::new())
}

#[tauri::command]
async fn install_app(
    app: tauri::AppHandle,
    app_id: String,
    installer_path: String,
) -> Result<(), String> {
    ensure_supported_app(&app_id)?;

    #[cfg(target_os = "windows")]
    {
        use std::{fs, path::PathBuf, process::Command};
        use tauri::Manager;

        let cache_dir = app
            .path()
            .app_cache_dir()
            .map_err(|error| format!("Не удалось открыть папку кэша хаба: {error}"))?;
        let expected_path = cache_dir
            .join("installers")
            .join("Limon-Calculator-windows-x64.msi");
        let installer_path = PathBuf::from(installer_path);
        let canonical_cache = fs::canonicalize(&cache_dir)
            .map_err(|error| format!("Не удалось проверить папку кэша хаба: {error}"))?;
        let canonical_installer = fs::canonicalize(&installer_path)
            .map_err(|error| format!("Не удалось найти скачанный установщик: {error}"))?;
        if canonical_installer != expected_path
            && canonical_installer
                != fs::canonicalize(&expected_path)
                    .map_err(|error| format!("Не удалось проверить MSI: {error}"))?
        {
            return Err("Путь установщика не совпадает с ожидаемым MSI приложения.".to_string());
        }
        if !canonical_installer.starts_with(canonical_cache) || !canonical_installer.is_file() {
            return Err("Установщик должен находиться в кэше Limon Hub.".to_string());
        }

        let status = tauri::async_runtime::spawn_blocking(move || {
            Command::new("msiexec.exe")
                .args(["/i"])
                .arg(canonical_installer)
                .status()
        })
        .await
        .map_err(|error| format!("Не удалось запустить установщик: {error}"))?
        .map_err(|error| format!("Не удалось запустить Windows Installer: {error}"))?;

        if status.success() || status.code() == Some(3010) {
            return Ok(());
        }
        return Err(match status.code() {
            Some(1602) => "Установка отменена.".to_string(),
            Some(code) => format!("Установщик завершился с кодом {code}."),
            None => "Установщик завершился без кода результата.".to_string(),
        });
    }

    #[cfg(not(target_os = "windows"))]
    Err("Установка приложений через MSI доступна только в Windows.".to_string())
}

#[tauri::command]
fn launch_app(app_id: String) -> Result<(), String> {
    ensure_supported_app(&app_id)?;

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let executable = calculator_executable()?
            .ok_or_else(|| "Limon Calculator не установлен.".to_string())?;
        Command::new(executable)
            .spawn()
            .map_err(|error| format!("Не удалось запустить Limon Calculator: {error}"))?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    Err("Запуск установленных приложений пока доступен только в Windows.".to_string())
}

#[tauri::command]
async fn uninstall_app(app_id: String) -> Result<(), String> {
    ensure_supported_app(&app_id)?;

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let install_dir = calculator_install_dir()?
            .ok_or_else(|| "Limon Calculator не установлен.".to_string())?;
        let product_code = calculator_product_code(&install_dir)?
            .ok_or_else(|| "Не удалось найти запись удаления Limon Calculator.".to_string())?;
        let status = tauri::async_runtime::spawn_blocking(move || {
            Command::new("msiexec.exe")
                .args(["/x", &product_code])
                .status()
        })
        .await
        .map_err(|error| format!("Не удалось запустить удаление: {error}"))?
        .map_err(|error| format!("Не удалось запустить Windows Installer: {error}"))?;

        if status.success() || status.code() == Some(3010) {
            return Ok(());
        }
        return Err(match status.code() {
            Some(1602) => "Удаление отменено.".to_string(),
            Some(code) => format!("Удаление завершилось с кодом {code}."),
            None => "Удаление завершилось без кода результата.".to_string(),
        });
    }

    #[cfg(not(target_os = "windows"))]
    Err("Удаление приложений через MSI доступно только в Windows.".to_string())
}

fn ensure_supported_app(app_id: &str) -> Result<(), String> {
    if app_id == "calculator" {
        Ok(())
    } else {
        Err(format!("Неизвестное приложение: {app_id}"))
    }
}

#[cfg(target_os = "windows")]
fn calculator_install_dir() -> Result<Option<std::path::PathBuf>, String> {
    use std::{path::PathBuf, process::Command};

    const INSTALL_KEY: &str = r"HKCU\Software\limon\Limon Calculator";
    let output = Command::new("reg.exe")
        .args(["query", INSTALL_KEY, "/v", "InstallDir"])
        .output()
        .map_err(|error| format!("Не удалось проверить установку калькулятора: {error}"))?;
    if !output.status.success() {
        return Ok(None);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let Some(install_dir) = stdout.lines().find_map(|line| {
        let line = line.trim();
        line.strip_prefix("InstallDir")
            .and_then(|value| value.split_once("REG_SZ"))
            .map(|(_, value)| value.trim())
            .filter(|value| !value.is_empty())
    }) else {
        return Ok(None);
    };

    let install_dir = PathBuf::from(install_dir);
    if install_dir.join("limon-calculator.exe").is_file() {
        Ok(Some(install_dir))
    } else {
        Ok(None)
    }
}

#[cfg(target_os = "windows")]
fn calculator_executable() -> Result<Option<std::path::PathBuf>, String> {
    Ok(calculator_install_dir()?.map(|path| path.join("limon-calculator.exe")))
}

#[cfg(target_os = "windows")]
fn calculator_product_code(
    install_dir: &std::path::Path,
) -> Result<Option<String>, String> {
    use std::process::Command;

    const UNINSTALL_KEYS: [&str; 3] = [
        r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    ];

    for key in UNINSTALL_KEYS {
        let output = Command::new("reg.exe")
            .args(["query", key, "/s"])
            .output()
            .map_err(|error| format!("Не удалось найти запись удаления приложения: {error}"))?;
        if !output.status.success() {
            continue;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut current_key = String::new();
        let mut display_name = String::new();
        let mut install_location = String::new();

        for line in stdout.lines().chain(std::iter::once("")) {
            let line = line.trim();
            if line.starts_with("HKEY_") || line.is_empty() {
                if display_name == "Limon Calculator"
                    && paths_match(&install_location, install_dir)
                {
                    if let Some(product_code) = current_key.rsplit('\\').next() {
                        if is_msi_product_code(product_code) {
                            return Ok(Some(product_code.to_string()));
                        }
                    }
                }

                current_key = line.to_string();
                display_name.clear();
                install_location.clear();
                continue;
            }

            if let Some((name, value)) = line.split_once("REG_SZ") {
                match name.trim() {
                    "DisplayName" => display_name = value.trim().to_string(),
                    "InstallLocation" => install_location = value.trim().to_string(),
                    _ => {}
                }
            }
        }
    }

    Ok(None)
}

#[cfg(target_os = "windows")]
fn paths_match(registry_path: &str, install_dir: &std::path::Path) -> bool {
    use std::{fs, path::Path};

    let registry_path = Path::new(registry_path.trim_end_matches(['\\', '/']));
    fs::canonicalize(registry_path)
        .ok()
        .zip(fs::canonicalize(install_dir).ok())
        .is_some_and(|(left, right)| left == right)
}

#[cfg(target_os = "windows")]
fn is_msi_product_code(value: &str) -> bool {
    let Some(guid) = value.strip_prefix('{').and_then(|value| value.strip_suffix('}')) else {
        return false;
    };
    guid.len() == 36
        && guid
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::is_msi_product_code;

    #[test]
    fn accepts_msi_product_codes() {
        assert!(is_msi_product_code(
            "{F2FC711D-02CB-5CBB-9162-48528A851D42}"
        ));
    }

    #[test]
    fn rejects_non_product_code_registry_keys() {
        assert!(!is_msi_product_code("Limon Calculator"));
        assert!(!is_msi_product_code("{not-a-guid}"));
    }
}
