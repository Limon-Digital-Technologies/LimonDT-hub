# Limon Digital Tech. Hub

Desktop ecosystem hub built with Tauri 2, Vite, vanilla JavaScript, and Supabase Auth. The Hub source lives in `Limon-Digital-Technologies/LimonDT-hub`; applications can be released independently from their own repositories.

## Download for Windows

**[Download Limon Hub](https://github.com/Limon-Digital-Technologies/LimonDT-hub/releases/latest/download/Limon-Hub-windows-x64.msi)** and open the downloaded MSI. Follow the standard Windows Installer prompts. If Windows asks for confirmation, review the publisher and approve only if you trust this release.

The Hub does not bundle catalog apps. Once Hub is open, browse the catalog and install only the apps you want.

## Development

```powershell
npm install
npm run tauri -- dev
```

To build the frontend independently:

```powershell
npm run build
```

To create a desktop release:

```powershell
npm run tauri -- build
```

## Project layout

- `src/main.js` — UI state, navigation, and event handling
- `src/data/app-catalog.js` — validates and loads published apps from Supabase
- `src/lib/supabase.js` — Supabase client configuration
- `src/ui/` — page rendering and shared SVG icons
- `src/data/catalog.js` — published ecosystem apps and navigation
- `src/styles.css` — layout, responsive behavior, and motion
- `src-tauri/` — Rust entry point, Tauri configuration, and native icons
- `.github/workflows/` — Windows release pipeline for the Hub
- `assets/HubLogo.png` — supplied source logo

## Supabase

The app uses Supabase email/password authentication. Registration saves the profile name in the user's Supabase Auth metadata. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` (see `.env.example`); never put a Supabase secret or service-role key in the desktop app.

Enable the Email provider in Supabase Auth. If email confirmation is required, users must confirm their address before signing in. Apply `supabase/migrations/20261101150000_create_app_catalog.sql` in the Supabase SQL Editor to create and seed the public, read-only `app_catalog` table. Manage product descriptions and publication status from the Supabase dashboard; keep application binaries in GitHub Releases. The Hub reads the latest published app metadata from Supabase, then selects the named MSI and SHA-256 asset from that app repository's latest stable GitHub Release. In the Windows Hub, **Установить** verifies the checksum, saves the installer to `Downloads\Limon Hub`, and starts the standard Windows Installer. If Windows reports an installer error, the MSI and its detailed log remain in that folder. After installation, the Hub detects the separate app on the device and offers **Запустить** and **Удалить**; app binaries are not bundled into the Hub. The browser preview can download the verified MSI, but cannot install, launch, or remove desktop apps.

## GitHub setup and releases

Create a **public** organization repository named `LimonDT-hub`, then push this project to its root. Public releases let the Hub download selected apps without embedding a GitHub token. The code and release assets will be public.

- Publish the Hub by updating its version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, refreshing `package-lock.json` with `npm install --package-lock-only`, and running `cargo check --manifest-path src-tauri/Cargo.toml`. Then push a matching `hub-v<version>` tag. The workflow builds a Windows MSI and publishes a stable `Limon-Hub-windows-x64.msi` download link and SHA-256 file. This basic installer release does not require updater signing keys.
- The standalone Calculator source and release workflow live only in the public `Limon-Digital-Technologies/LimonDT-Calculator` repository. Build and release it from that repository by pushing a matching `v<version>` tag (current release: `v1.0.1`); its workflow attaches a Windows MSI and SHA-256 checksum. The Hub repository contains only the catalog entry and Windows integration needed to install, launch, or remove the app.
- Users download only the Hub MSI first. From the Hub, they can download only the app they choose.

### Enable signed Hub auto-updates

In-app Hub auto-updates are not enabled for the basic MSI release. To enable signed auto-updates later, generate a key pair locally:

```powershell
npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\limondt-hub.key"
```

In the repository's **Settings → Secrets and variables → Actions**, add:

- Secret `TAURI_SIGNING_PRIVATE_KEY` with the contents of the generated private key file.
- Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` with its password, if one was set.
- Repository variable `TAURI_UPDATER_PUBLIC_KEY` with the public key printed by the signer.

Keep the private key out of the repository and never send it in chat. The release workflow must be extended to sign updater artifacts before using these settings. Until then, install Hub updates by downloading the latest MSI from the link above.

Run Hub tests with `npm test`. Run calculator tests and builds from a separate clone of `Limon-Digital-Technologies/LimonDT-Calculator`; the Calculator project is not part of this repository or the Hub bundle.
