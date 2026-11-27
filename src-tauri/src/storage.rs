use std::path::{Path, PathBuf};

const STORAGE_REGISTRY_KEY: &str = r"Software\Limon Digital Technologies\Ecosystem";

pub fn configured_root() -> Result<Option<PathBuf>, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::{enums::HKEY_CURRENT_USER, RegKey};

        let current_user = RegKey::predef(HKEY_CURRENT_USER);
        let key = match current_user.open_subkey(STORAGE_REGISTRY_KEY) {
            Ok(key) => key,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(format!(
                    "Не удалось прочитать путь хранилища Limon: {error}"
                ))
            }
        };
        let root: String = key
            .get_value("RootPath")
            .map_err(|error| format!("Не удалось прочитать путь хранилища Limon: {error}"))?;
        let path = PathBuf::from(root);
        if !path.is_absolute() {
            return Err("В настройках Limon указан некорректный путь хранилища.".to_string());
        }
        return Ok(Some(path));
    }

    #[cfg(not(target_os = "windows"))]
    Ok(None)
}

pub fn available_drives() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        return (b'A'..=b'Z')
            .map(|letter| format!("{}:", letter as char))
            .filter(|drive| Path::new(&format!("{drive}\\")).is_dir())
            .collect();
    }

    #[cfg(not(target_os = "windows"))]
    Vec::new()
}

pub fn configure_root(drive: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::{fs, path::PathBuf};
        use winreg::{enums::HKEY_CURRENT_USER, RegKey};

        let drive = normalize_drive(drive)?;
        let drive_root = PathBuf::from(format!("{drive}\\"));
        if !drive_root.is_dir() {
            return Err(format!("Диск {drive} сейчас недоступен."));
        }

        let local_data = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .ok_or_else(|| "Windows не предоставила путь к профилю пользователя.".to_string())?;
        let profile_name = std::env::var_os("USERPROFILE")
            .and_then(|path| {
                PathBuf::from(path)
                    .file_name()
                    .map(|name| name.to_os_string())
            })
            .ok_or_else(|| "Не удалось определить профиль пользователя Windows.".to_string())?;
        let system_drive = std::env::var("SystemDrive").unwrap_or_default();
        let root = if system_drive.eq_ignore_ascii_case(&drive) {
            local_data.join("LimonDT")
        } else {
            drive_root.join("LimonDT").join(profile_name)
        };

        for directory in ["Apps", "Data", "Downloads"] {
            fs::create_dir_all(root.join(directory))
                .map_err(|error| format!("Не удалось создать папку хранилища Limon: {error}"))?;
        }

        let current_user = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = current_user
            .create_subkey(STORAGE_REGISTRY_KEY)
            .map_err(|error| format!("Не удалось сохранить путь хранилища Limon: {error}"))?;
        key.set_value("RootPath", &root.to_string_lossy().to_string())
            .map_err(|error| format!("Не удалось сохранить путь хранилища Limon: {error}"))?;

        return Ok(root.to_string_lossy().to_string());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = drive;
        Err("Общее хранилище пока поддерживается только в Windows.".to_string())
    }
}

pub fn app_install_dir(root: &Path, app_id: &str) -> Result<PathBuf, String> {
    validate_app_id(app_id)?;
    Ok(root.join("Apps").join(app_id))
}

pub fn downloads_dir(root: &Path) -> PathBuf {
    root.join("Downloads").join("Hub")
}

pub fn prepare_context(
    app_id: &str,
    identifier: &str,
) -> (tauri::Context<tauri::Wry>, Option<String>) {
    let mut context = tauri::generate_context!();
    let mut startup_error = None;

    #[cfg(target_os = "windows")]
    match configured_root() {
        Ok(Some(root)) => {
            let data_dir = root.join("Data").join(app_id);
            match migrate_webview_data(identifier, app_id, &root, &data_dir) {
                Ok(()) => {
                    context.config_mut().app.app_directories_override =
                        Some(tauri::utils::config::AppDirectoriesOverride::Root(data_dir));
                }
                Err(error) => startup_error = Some(error),
            }
        }
        Ok(None) => {}
        Err(error) => startup_error = Some(error),
    }

    #[cfg(not(target_os = "windows"))]
    let _ = (app_id, identifier);

    (context, startup_error)
}

#[cfg(target_os = "windows")]
fn migrate_webview_data(
    identifier: &str,
    app_id: &str,
    root: &Path,
    destination: &Path,
) -> Result<(), String> {
    use std::fs;

    let local_data = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| "Windows не предоставила путь к локальным данным.".to_string())?;
    let source = local_data.join(identifier);
    let marker = root
        .join("Data")
        .join(format!("{app_id}.migration-complete"));
    if marker.is_file() {
        return Ok(());
    }

    if destination.exists() {
        if source.exists()
            && fs::read_dir(destination)
                .map_err(|error| error.to_string())?
                .next()
                .is_some()
        {
            return Err(format!(
                "Папка данных {app_id} уже содержит файлы, перенос остановлен без изменений."
            ));
        }
        if source.exists() {
            fs::remove_dir(destination).map_err(|error| {
                format!("Не удалось подготовить папку для переноса данных {app_id}: {error}")
            })?;
        } else {
            fs::write(&marker, b"1").map_err(|error| {
                format!("Не удалось сохранить отметку переноса данных: {error}")
            })?;
            return Ok(());
        }
    }

    if source.is_dir() {
        let staging = destination.with_extension("migrating");
        match fs::symlink_metadata(&staging) {
            Ok(metadata) if metadata.file_type().is_dir() => {}
            Ok(_) => {
                return Err(format!(
                    "Вместо временной папки переноса данных {app_id} найден файл; исходные данные сохранены."
                ))
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "Не удалось проверить временную папку переноса данных {app_id}: {error}"
                ))
            }
        }
        copy_directory(&source, &staging)
            .map_err(|error| format!("Не удалось перенести данные {app_id}: {error}"))?;
        fs::rename(&staging, destination)
            .map_err(|error| format!("Не удалось завершить перенос данных {app_id}: {error}"))?;
    } else {
        let staging = destination.with_extension("migrating");
        if staging.exists() {
            return Err(format!(
                "Найдена временная папка переноса данных {app_id}, но исходная папка отсутствует. Данные сохранены."
            ));
        }
        fs::create_dir_all(destination)
            .map_err(|error| format!("Не удалось создать папку данных {app_id}: {error}"))?;
    }

    fs::write(&marker, b"1")
        .map_err(|error| format!("Не удалось сохранить отметку переноса данных: {error}"))?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn copy_directory(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::fs;

    let source_metadata = fs::symlink_metadata(source)?;
    if !source_metadata.file_type().is_dir() || source_metadata.file_type().is_symlink() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Источник переноса не является обычной папкой.",
        ));
    }

    match fs::symlink_metadata(destination) {
        Ok(metadata) if metadata.file_type().is_dir() => {}
        Ok(_) => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Временная папка переноса содержит некорректный путь.",
            ))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(destination)?;
        }
        Err(error) => return Err(error),
    }

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Символические ссылки в профиле WebView не поддерживаются.",
            ));
        }
        let destination_type = match fs::symlink_metadata(&destination_path) {
            Ok(metadata) => {
                let file_type = metadata.file_type();
                if file_type.is_symlink() {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::InvalidData,
                        "Символическая ссылка найдена во временной папке переноса.",
                    ));
                }
                Some(file_type)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(error),
        };
        if file_type.is_dir() {
            if destination_type.is_some_and(|file_type| !file_type.is_dir()) {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "Структура временной папки переноса не совпадает с исходной.",
                ));
            }
            copy_directory(&source_path, &destination_path)?;
        } else if file_type.is_file() {
            if destination_type.is_some_and(|file_type| file_type.is_dir()) {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "Структура временной папки переноса не совпадает с исходной.",
                ));
            }
            fs::copy(source_path, destination_path)?;
        }
    }
    Ok(())
}

fn normalize_drive(drive: &str) -> Result<String, String> {
    let letter = drive.trim().trim_end_matches(':');
    if letter.len() != 1 || !letter.as_bytes()[0].is_ascii_alphabetic() {
        return Err("Выберите доступный диск.".to_string());
    }
    Ok(format!("{}:", letter.to_ascii_uppercase()))
}

fn validate_app_id(app_id: &str) -> Result<(), String> {
    if !app_id.is_empty()
        && app_id.len() <= 64
        && app_id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        Ok(())
    } else {
        Err("Некорректный идентификатор приложения.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_drive, validate_app_id};

    #[test]
    fn normalizes_drive_letters_only() {
        assert_eq!(normalize_drive("d").unwrap(), "D:");
        assert_eq!(normalize_drive("C:").unwrap(), "C:");
        assert!(normalize_drive("D:\\Apps").is_err());
        assert!(normalize_drive("").is_err());
    }

    #[test]
    fn accepts_only_safe_app_ids() {
        assert!(validate_app_id("calculator").is_ok());
        assert!(validate_app_id("limon-notes").is_ok());
        assert!(validate_app_id("../notes").is_err());
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn resumes_a_partial_copy_into_the_existing_migration_staging_folder() {
        use super::copy_directory;
        use std::{fs, time::SystemTime};

        let unique = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let test_root = std::env::temp_dir().join(format!(
            "limon-storage-migration-{}-{unique}",
            std::process::id()
        ));
        let source = test_root.join("source");
        let staging = test_root.join("target.migrating");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&staging).unwrap();
        fs::write(source.join("preferences.dat"), b"complete source").unwrap();
        fs::write(staging.join("preferences.dat"), b"partial copy").unwrap();
        fs::create_dir_all(source.join("nested")).unwrap();
        fs::write(source.join("nested").join("state.dat"), b"nested source").unwrap();

        copy_directory(&source, &staging).unwrap();

        assert_eq!(
            fs::read(source.join("preferences.dat")).unwrap(),
            b"complete source"
        );
        assert_eq!(
            fs::read(staging.join("preferences.dat")).unwrap(),
            b"complete source"
        );
        assert_eq!(
            fs::read(staging.join("nested").join("state.dat")).unwrap(),
            b"nested source"
        );
        fs::remove_dir_all(test_root).unwrap();
    }
}
