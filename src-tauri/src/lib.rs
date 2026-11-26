mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (context, storage_error) = storage::prepare_context("hub", "tech.limon.digital.hub");
    tauri::Builder::default()
        .manage(StorageStartupError(storage_error))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_storage_info,
            configure_storage_root,
            relocate_hub_to_storage,
            get_installed_apps,
            install_app,
            launch_app,
            uninstall_app
        ])
        .run(context)
        .expect("error while running Limon Digital Tech. Hub");
}

struct StorageStartupError(Option<String>);

#[tauri::command]
fn get_storage_info(
    startup_error: tauri::State<'_, StorageStartupError>,
) -> Result<serde_json::Value, String> {
    let root = storage::configured_root()?;
    let hub_relocation_required = match &root {
        Some(root) => hub_relocation_required(root)?,
        None => false,
    };
    Ok(serde_json::json!({
        "root": root.map(|path| path.to_string_lossy().to_string()),
        "drives": storage::available_drives(),
        "migrationError": startup_error.0,
        "hubRelocationRequired": hub_relocation_required,
    }))
}

#[tauri::command]
fn configure_storage_root(drive: String) -> Result<String, String> {
    if storage::configured_root()?.is_some() {
        return Err("Общая папка Limon уже настроена.".to_string());
    }
    storage::configure_root(&drive)
}

#[tauri::command]
async fn relocate_hub_to_storage(app: tauri::AppHandle, file_name: String) -> Result<bool, String> {
    ensure_msi_file_name(&file_name)?;

    #[cfg(target_os = "windows")]
    {
        use std::{fs, io::Read, process::Command};
        use tauri::Manager;

        let root = storage::configured_root()?
            .ok_or_else(|| "Сначала выберите диск для общей папки Limon.".to_string())?;
        let Some(old_dir) = app_install_dir("hub")? else {
            return Ok(false);
        };
        let target_dir = storage::app_install_dir(&root, "hub")?;
        if path_is_within(&old_dir, &target_dir) {
            return Ok(false);
        }
        let product_code = app_product_code("hub", &old_dir)?
            .ok_or_else(|| "Не удалось найти MSI-запись установленного Limon Hub.".to_string())?;

        let cache_dir = app
            .path()
            .app_cache_dir()
            .map_err(|error| format!("Не удалось открыть папку кэша хаба: {error}"))?;
        let cached_installer = cache_dir.join("installers").join(&file_name);
        let canonical_cache = fs::canonicalize(&cache_dir)
            .map_err(|error| format!("Не удалось проверить папку кэша хаба: {error}"))?;
        let canonical_cached_installer = fs::canonicalize(&cached_installer)
            .map_err(|error| format!("Не удалось найти скачанный установщик хаба: {error}"))?;
        if !canonical_cached_installer.starts_with(canonical_cache)
            || !canonical_cached_installer.is_file()
        {
            return Err("Установщик хаба должен находиться в кэше Limon Hub.".to_string());
        }
        let mut package = fs::File::open(&canonical_cached_installer)
            .map_err(|error| format!("Не удалось прочитать скачанный MSI хаба: {error}"))?;
        let mut header = [0; 8];
        package
            .read_exact(&mut header)
            .map_err(|error| format!("Скачанный файл MSI хаба неполный: {error}"))?;
        if !is_msi_file_header(&header) {
            return Err("Скачанный файл хаба не является установщиком MSI.".to_string());
        }

        let downloads_dir = storage::downloads_dir(&root);
        fs::create_dir_all(&downloads_dir)
            .map_err(|error| format!("Не удалось создать папку установщиков: {error}"))?;
        let installer_path = downloads_dir.join(&file_name);
        fs::copy(&canonical_cached_installer, &installer_path)
            .map_err(|error| format!("Не удалось сохранить MSI хаба в общем хранилище: {error}"))?;
        let installer_path = msiexec_compatible_path(
            &fs::canonicalize(&installer_path)
                .map_err(|error| format!("Не удалось проверить MSI хаба: {error}"))?,
        );
        let log_path = msiexec_compatible_path(&downloads_dir.join("hub-relocation.log"));
        let old_dir = msiexec_compatible_path(&old_dir);
        let target_dir = msiexec_compatible_path(&target_dir);
        let script_path = downloads_dir.join(format!("move-hub-{}.ps1", std::process::id()));
        let script = hub_relocation_script(
            std::process::id(),
            &product_code,
            &installer_path,
            &old_dir,
            &target_dir,
            &log_path,
            &script_path,
        );
        write_powershell_script(&script_path, &script)?;

        if let Err(error) = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-WindowStyle",
                "Hidden",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
            ])
            .arg(&script_path)
            .spawn()
        {
            let _ = fs::remove_file(&script_path);
            return Err(format!(
                "Не удалось запустить переносчик Limon Hub: {error}"
            ));
        }
        let app_to_exit = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(1));
            app_to_exit.exit(0);
        });
        return Ok(true);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, file_name);
        Ok(false)
    }
}

#[tauri::command]
fn get_installed_apps() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let storage_root = storage::configured_root()?;
        let mut installed = Vec::new();
        for app_id in ["calculator", "notes"] {
            if let Some(install_dir) = app_install_dir(app_id)? {
                let is_managed = match &storage_root {
                    Some(root) => {
                        let managed_dir = storage::app_install_dir(root, app_id)?;
                        path_is_within(&install_dir, &managed_dir)
                    }
                    None => true,
                };
                if is_managed {
                    installed.push(app_id.to_string());
                }
            }
        }
        return Ok(installed);
    }

    #[cfg(not(target_os = "windows"))]
    Ok(Vec::new())
}

#[tauri::command]
async fn install_app(
    app: tauri::AppHandle,
    app_id: String,
    file_name: String,
) -> Result<(), String> {
    ensure_supported_app(&app_id)?;
    ensure_msi_file_name(&file_name)?;

    #[cfg(target_os = "windows")]
    {
        use std::{fs, io::Read, process::Command};
        use tauri::Manager;

        let root = storage::configured_root()?
            .ok_or_else(|| "Сначала выберите диск для общей папки Limon.".to_string())?;
        let install_dir = storage::app_install_dir(&root, &app_id)?;
        let existing_install =
            app_install_dir(&app_id)?.filter(|path| !path_is_within(path, &install_dir));
        let existing_product_code = match &existing_install {
            Some(path) => Some(
                app_product_code(&app_id, path)?
                    .ok_or_else(|| format!("Не удалось найти установщик для переноса {app_id}."))?,
            ),
            None => None,
        };
        let cache_dir = app
            .path()
            .app_cache_dir()
            .map_err(|error| format!("Не удалось открыть папку кэша хаба: {error}"))?;
        let cached_installer = cache_dir.join("installers").join(&file_name);
        let canonical_cache = fs::canonicalize(&cache_dir)
            .map_err(|error| format!("Не удалось проверить папку кэша хаба: {error}"))?;
        let canonical_cached_installer = fs::canonicalize(&cached_installer)
            .map_err(|error| format!("Не удалось найти скачанный установщик: {error}"))?;
        if !canonical_cached_installer.starts_with(canonical_cache)
            || !canonical_cached_installer.is_file()
        {
            return Err("Установщик должен находиться в кэше Limon Hub.".to_string());
        }

        let mut package = fs::File::open(&canonical_cached_installer)
            .map_err(|error| format!("Не удалось прочитать скачанный MSI: {error}"))?;
        let mut header = [0; 8];
        package
            .read_exact(&mut header)
            .map_err(|error| format!("Скачанный файл MSI неполный: {error}"))?;
        if !is_msi_file_header(&header) {
            return Err("Скачанный файл не является установщиком Windows MSI.".to_string());
        }

        let downloads_dir = storage::downloads_dir(&root);
        fs::create_dir_all(&downloads_dir)
            .map_err(|error| format!("Не удалось создать папку установщиков: {error}"))?;
        let installer_path = downloads_dir.join(&file_name);
        fs::copy(&canonical_cached_installer, &installer_path)
            .map_err(|error| format!("Не удалось сохранить MSI в общую папку: {error}"))?;
        let installer_path = fs::canonicalize(&installer_path)
            .map_err(|error| format!("Не удалось проверить MSI в общей папке: {error}"))?;
        let log_path = downloads_dir.join(format!(
            "{}-install.log",
            file_name.trim_end_matches(".msi")
        ));
        let installer_path = msiexec_compatible_path(&installer_path);
        let log_path = msiexec_compatible_path(&log_path);

        tauri::async_runtime::spawn_blocking(move || {
            if let (Some(old_dir), Some(product_code)) =
                (existing_install.as_ref(), existing_product_code.as_ref())
            {
                let uninstall_status = Command::new("msiexec.exe")
                    .args(["/x", product_code, "/qn", "/norestart", "/L*v"])
                    .arg(&log_path)
                    .status()
                    .map_err(|error| format!("Не удалось начать перенос приложения: {error}"))?;
                if !msi_status_succeeded(&uninstall_status) {
                    return Err(format!(
                        "Не удалось удалить старую копию приложения (код {:?}). Она осталась на месте.",
                        uninstall_status.code()
                    ));
                }

                let install_status = Command::new("msiexec.exe")
                    .args(["/i"])
                    .arg(&installer_path)
                    .arg(format!("INSTALLDIR={}", install_dir.display()))
                    .args(["/qn", "/norestart", "/L*v"])
                    .arg(&log_path)
                    .status()
                    .map_err(|error| format!("Не удалось установить приложение в общую папку: {error}"));
                match install_status {
                    Ok(status) if msi_status_succeeded(&status) => Ok(()),
                    install_result => {
                        let install_error = match install_result {
                            Ok(status) => format!("код {:?}", status.code()),
                            Err(error) => error,
                        };
                        let rollback = Command::new("msiexec.exe")
                            .args(["/i"])
                            .arg(&installer_path)
                            .arg(format!("INSTALLDIR={}", old_dir.display()))
                            .args(["/qn", "/norestart", "/L*v"])
                            .arg(&log_path)
                            .status();
                        match rollback {
                            Ok(status) if msi_status_succeeded(&status) => Err(format!(
                                "Перенос не удался; приложение восстановлено в исходной папке: {}. Результат установки: {}",
                                old_dir.display(),
                                install_error
                            )),
                            rollback_result => Err(format!(
                                "Перенос не удался, и автоматическое восстановление также завершилось ошибкой: {:?}. MSI сохранён здесь: {}",
                                rollback_result.err(),
                                installer_path.display()
                            )),
                        }
                    }
                }
            } else {
                let status = Command::new("msiexec.exe")
                    .args(["/i"])
                    .arg(&installer_path)
                    .arg(format!("INSTALLDIR={}", install_dir.display()))
                    .args(["/qn", "/norestart", "/L*v"])
                    .arg(&log_path)
                    .status()
                    .map_err(|error| {
                        format!(
                            "Не удалось запустить Windows Installer: {error}. MSI сохранён здесь: {}",
                            installer_path.display()
                        )
                    })?;
                if msi_status_succeeded(&status) {
                    Ok(())
                } else {
                    Err(format!(
                        "Установка завершилась с кодом {:?}. MSI сохранён здесь: {}",
                        status.code(),
                        installer_path.display()
                    ))
                }
            }
        })
        .await
        .map_err(|error| format!("Не удалось запустить установщик: {error}"))??;
        Ok(())
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

        let install_dir =
            app_install_dir(&app_id)?.ok_or_else(|| format!("{app_id} не установлен."))?;
        let executable = install_dir.join(executable_name(&app_id)?);
        Command::new(executable)
            .spawn()
            .map_err(|error| format!("Не удалось запустить {app_id}: {error}"))?;
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

        let install_dir =
            app_install_dir(&app_id)?.ok_or_else(|| format!("{app_id} не установлен."))?;
        let product_code = app_product_code(&app_id, &install_dir)?
            .ok_or_else(|| format!("Не удалось найти запись удаления {app_id}."))?;
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
    if matches!(app_id, "calculator" | "notes") {
        Ok(())
    } else {
        Err(format!("Неизвестное приложение: {app_id}"))
    }
}

fn ensure_known_app(app_id: &str) -> Result<(), String> {
    if matches!(app_id, "calculator" | "notes" | "hub") {
        Ok(())
    } else {
        Err(format!("Неизвестное приложение: {app_id}"))
    }
}

fn executable_name(app_id: &str) -> Result<&'static str, String> {
    match app_id {
        "calculator" => Ok("limon-calculator.exe"),
        "notes" => Ok("limon-notes.exe"),
        "hub" => Ok("limon-digital-tech-hub.exe"),
        _ => Err(format!("Неизвестное приложение: {app_id}")),
    }
}

fn ensure_msi_file_name(file_name: &str) -> Result<(), String> {
    if file_name.len() <= 200
        && file_name.to_ascii_lowercase().ends_with(".msi")
        && file_name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        Ok(())
    } else {
        Err("Для установки требуется корректное имя MSI-файла.".to_string())
    }
}

fn is_msi_file_header(header: &[u8; 8]) -> bool {
    header == b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1"
}

fn msi_status_succeeded(status: &std::process::ExitStatus) -> bool {
    status.success() || status.code() == Some(3010)
}

#[cfg(target_os = "windows")]
fn powershell_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

#[cfg(target_os = "windows")]
fn hub_relocation_script(
    process_id: u32,
    product_code: &str,
    installer: &std::path::Path,
    old_dir: &std::path::Path,
    target_dir: &std::path::Path,
    log_path: &std::path::Path,
    script_path: &std::path::Path,
) -> String {
    let old_executable =
        powershell_literal(&old_dir.join("limon-digital-tech-hub.exe").to_string_lossy());
    let new_executable = powershell_literal(
        &target_dir
            .join("limon-digital-tech-hub.exe")
            .to_string_lossy(),
    );
    let installer = powershell_literal(&installer.to_string_lossy());
    let old_dir = powershell_literal(&old_dir.to_string_lossy());
    let target_dir = powershell_literal(&target_dir.to_string_lossy());
    let log_path = powershell_literal(&log_path.to_string_lossy());
    let script_path = powershell_literal(&script_path.to_string_lossy());
    let product_code = powershell_literal(product_code);

    format!(
        "$ErrorActionPreference = 'Stop'\n\
         while (Get-Process -Id {process_id} -ErrorAction SilentlyContinue) {{ Start-Sleep -Milliseconds 250 }}\n\
         $installer = {installer}\n\
         $oldDir = {old_dir}\n\
         $targetDir = {target_dir}\n\
         $log = {log_path}\n\
         try {{\n\
           $removeArgs = '/x ' + {product_code} + ' /passive /norestart /L*v \"' + $log + '\"'\n\
           $remove = Start-Process -FilePath 'msiexec.exe' -ArgumentList $removeArgs -Wait -PassThru\n\
           if ($remove.ExitCode -notin @(0, 3010, 1605)) {{ throw \"Removing the previous Hub failed with code $($remove.ExitCode).\" }}\n\
           $installArgs = '/i \"' + $installer + '\" INSTALLDIR=\"' + $targetDir + '\" /passive /norestart /L*v \"' + $log + '\"'\n\
           $install = Start-Process -FilePath 'msiexec.exe' -ArgumentList $installArgs -Wait -PassThru\n\
           if ($install.ExitCode -notin @(0, 3010)) {{ throw \"Installing Hub in the shared folder failed with code $($install.ExitCode).\" }}\n\
           $newExecutable = {new_executable}\n\
           if (-not (Test-Path -LiteralPath $newExecutable)) {{ throw 'The relocated Hub executable was not found.' }}\n\
           Start-Process -FilePath $newExecutable\n\
         }} catch {{\n\
           Add-Content -LiteralPath $log -Value $_.Exception.ToString()\n\
           $rollbackArgs = '/i \"' + $installer + '\" INSTALLDIR=\"' + $oldDir + '\" /passive /norestart /L*v \"' + $log + '\"'\n\
           $rollback = Start-Process -FilePath 'msiexec.exe' -ArgumentList $rollbackArgs -Wait -PassThru\n\
           if ($rollback.ExitCode -in @(0, 3010)) {{\n\
             $oldExecutable = {old_executable}\n\
             if (Test-Path -LiteralPath $oldExecutable) {{ Start-Process -FilePath $oldExecutable }}\n\
           }} else {{ Add-Content -LiteralPath $log -Value \"Hub rollback failed with code $($rollback.ExitCode).\" }}\n\
         }} finally {{ Remove-Item -LiteralPath {script_path} -Force -ErrorAction SilentlyContinue }}\n"
    )
}

#[cfg(target_os = "windows")]
fn write_powershell_script(path: &std::path::Path, script: &str) -> Result<(), String> {
    use std::{fs::OpenOptions, io::Write};

    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| format!("Не удалось создать сценарий переноса Hub: {error}"))?;
    file.write_all(&[0xff, 0xfe])
        .and_then(|_| {
            for unit in script.encode_utf16() {
                file.write_all(&unit.to_le_bytes())?;
            }
            Ok(())
        })
        .map_err(|error| format!("Не удалось записать сценарий переноса Hub: {error}"))
}

fn path_is_within(path: &std::path::Path, directory: &std::path::Path) -> bool {
    let path = path.to_string_lossy();
    let directory = directory.to_string_lossy();
    let directory = directory.trim_end_matches(['\\', '/']);
    path.eq_ignore_ascii_case(directory)
        || path
            .get(..directory.len())
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case(directory))
            && path
                .get(directory.len()..)
                .is_some_and(|suffix| suffix.starts_with('\\') || suffix.starts_with('/'))
}

fn msiexec_compatible_path(path: &std::path::Path) -> std::path::PathBuf {
    let path_text = path.to_string_lossy();
    if let Some(unc_path) = path_text.strip_prefix(r"\\?\UNC\") {
        return std::path::PathBuf::from(format!(r"\\{unc_path}"));
    }
    if let Some(normal_path) = path_text.strip_prefix(r"\\?\") {
        return std::path::PathBuf::from(normal_path);
    }
    path.to_path_buf()
}

#[cfg(test)]
mod msi_tests {
    use super::{ensure_msi_file_name, is_msi_file_header, msiexec_compatible_path};
    use std::path::Path;

    #[test]
    fn accepts_compound_file_msi_signature() {
        assert!(is_msi_file_header(b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1"));
    }

    #[test]
    fn rejects_non_msi_downloads() {
        assert!(!is_msi_file_header(b"<html>40"));
    }

    #[test]
    fn accepts_safe_msi_file_names() {
        assert!(ensure_msi_file_name("Limon-Calculator-windows-x64.msi").is_ok());
    }

    #[test]
    fn rejects_paths_and_non_msi_names() {
        assert!(ensure_msi_file_name("../installer.msi").is_err());
        assert!(ensure_msi_file_name("installer.exe").is_err());
    }

    #[test]
    fn removes_windows_verbatim_prefix_for_msi_exec() {
        assert_eq!(
            msiexec_compatible_path(Path::new(r"\\?\C:\Users\user\Downloads\Limon Hub\app.msi")),
            Path::new(r"C:\Users\user\Downloads\Limon Hub\app.msi")
        );
        assert_eq!(
            msiexec_compatible_path(Path::new(r"\\?\UNC\server\share\app.msi")),
            Path::new(r"\\server\share\app.msi")
        );
        assert_eq!(
            msiexec_compatible_path(Path::new(r"C:\Downloads\app.msi")),
            Path::new(r"C:\Downloads\app.msi")
        );
    }
}

#[cfg(all(test, target_os = "windows"))]
mod hub_relocation_tests {
    use super::{hub_relocation_script, powershell_literal};
    use std::path::Path;

    #[test]
    fn escapes_powershell_literals_and_restores_hub_on_relocation_failure() {
        let script = hub_relocation_script(
            42,
            "{F2FC711D-02CB-5CBB-9162-48528A851D42}",
            Path::new(r"C:\Users\O'Brien\LimonDT\Downloads\hub.msi"),
            Path::new(r"C:\Users\O'Brien\AppData\Local\Programs\Limon Hub"),
            Path::new(r"D:\LimonDT\user\Apps\hub"),
            Path::new(r"D:\LimonDT\user\Downloads\Hub\hub-relocation.log"),
            Path::new(r"D:\LimonDT\user\Downloads\Hub\move-hub.ps1"),
        );

        assert!(script.contains("'C:\\Users\\O''Brien\\LimonDT\\Downloads\\hub.msi'"));
        assert!(script.contains("while (Get-Process -Id 42"));
        assert!(script.contains("/x ' + '{F2FC711D-02CB-5CBB-9162-48528A851D42}'"));
        assert!(script.contains("$rollbackArgs"));
        assert!(script.contains("Start-Process -FilePath $oldExecutable"));
    }

    #[test]
    fn escapes_single_quotes_in_powershell_values() {
        assert_eq!(
            powershell_literal(r"C:\Users\O'Brien"),
            "'C:\\Users\\O''Brien'"
        );
    }
}

#[cfg(target_os = "windows")]
fn app_install_dir(app_id: &str) -> Result<Option<std::path::PathBuf>, String> {
    use std::{path::PathBuf, process::Command};

    ensure_known_app(app_id)?;
    let display_name = app_display_name(app_id)?;
    let executable = executable_name(app_id)?;
    if app_id == "calculator" {
        const INSTALL_KEY: &str = r"HKCU\Software\limon\Limon Calculator";
        let output = Command::new("reg.exe")
            .args(["query", INSTALL_KEY, "/v", "InstallDir"])
            .output()
            .map_err(|error| format!("Не удалось проверить установку Limon Calculator: {error}"))?;
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(install_dir) = stdout.lines().find_map(|line| {
                let line = line.trim();
                line.strip_prefix("InstallDir")
                    .and_then(|value| value.split_once("REG_SZ"))
                    .map(|(_, value)| value.trim())
                    .filter(|value| !value.is_empty())
            }) {
                let install_dir = PathBuf::from(install_dir);
                if install_dir.join(executable).is_file() {
                    return Ok(Some(install_dir));
                }
            }
        }
    }

    installed_app_location(display_name, executable)
}

#[cfg(target_os = "windows")]
fn app_product_code(app_id: &str, install_dir: &std::path::Path) -> Result<Option<String>, String> {
    use std::process::Command;

    let expected_display_name = app_display_name(app_id)?;
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
                if display_name == expected_display_name
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
fn installed_app_location(
    expected_display_name: &str,
    expected_executable: &str,
) -> Result<Option<std::path::PathBuf>, String> {
    use std::{path::PathBuf, process::Command};

    const UNINSTALL_KEYS: [&str; 3] = [
        r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    ];

    for key in UNINSTALL_KEYS {
        let output = Command::new("reg.exe")
            .args(["query", key, "/s"])
            .output()
            .map_err(|error| format!("Не удалось проверить установленное приложение: {error}"))?;
        if !output.status.success() {
            continue;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut display_name = String::new();
        let mut install_location = String::new();
        for line in stdout.lines().chain(std::iter::once("")) {
            let line = line.trim();
            if line.starts_with("HKEY_") || line.is_empty() {
                if display_name == expected_display_name && !install_location.is_empty() {
                    let path = PathBuf::from(&install_location);
                    if path.join(expected_executable).is_file() {
                        return Ok(Some(path));
                    }
                }
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

fn app_display_name(app_id: &str) -> Result<&'static str, String> {
    match app_id {
        "calculator" => Ok("Limon Calculator"),
        "notes" => Ok("Limon Notes"),
        "hub" => Ok("Limon Digital Tech. Hub"),
        _ => Err(format!("Неизвестное приложение: {app_id}")),
    }
}

#[cfg(target_os = "windows")]
fn hub_relocation_required(root: &std::path::Path) -> Result<bool, String> {
    let Some(install_dir) = app_install_dir("hub")? else {
        return Ok(false);
    };
    let target_dir = storage::app_install_dir(root, "hub")?;
    Ok(!path_is_within(&install_dir, &target_dir))
}

#[cfg(not(target_os = "windows"))]
fn hub_relocation_required(_root: &std::path::Path) -> Result<bool, String> {
    Ok(false)
}

#[cfg(not(target_os = "windows"))]
fn app_install_dir(_app_id: &str) -> Result<Option<std::path::PathBuf>, String> {
    Ok(None)
}

#[cfg(not(target_os = "windows"))]
fn app_product_code(
    _app_id: &str,
    _install_dir: &std::path::Path,
) -> Result<Option<String>, String> {
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
    let Some(guid) = value
        .strip_prefix('{')
        .and_then(|value| value.strip_suffix('}'))
    else {
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
