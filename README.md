# Limon Digital Tech. Hub

Desktop ecosystem hub built with Tauri 2, Vite, vanilla JavaScript, and Supabase Auth. The Hub source lives in `Limon-Digital-Technologies/LimonDT-hub`; applications can be released independently from their own repositories.

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
- `apps/Limon-Calculator/` — separate Tauri calculator app and its GitHub Release workflow
- `src/lib/supabase.js` — Supabase client configuration
- `src/ui/` — page rendering and shared SVG icons
- `src/data/catalog.js` — published ecosystem apps and navigation
- `src/styles.css` — layout, responsive behavior, and motion
- `src-tauri/` — Rust entry point, Tauri configuration, and native icons
- `.github/workflows/` — separate Windows release pipelines for the Hub and Calculator
- `assets/HubLogo.png` — supplied source logo

## Supabase

The app uses Supabase email/password authentication. Registration saves the profile name in the user's Supabase Auth metadata. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` (see `.env.example`); never put a Supabase secret or service-role key in the desktop app.

Enable the Email provider in Supabase Auth. If email confirmation is required, users must confirm their address before signing in. The app catalog currently contains the standalone Windows Limon Calculator. Downloading retrieves its `.msi` and SHA-256 checksum from the latest stable release in `Limon-Digital-Technologies/LimonDT-Calculator`, verifies the installer, saves it to the device, and adds it to that account's local library. Run the saved MSI to install the separate desktop app; the library's **Открыть в хабе** action opens its calculator view inside the Hub.

## GitHub setup and releases

Create a **public** organization repository named `LimonDT-hub`, then push this project to its root. Public releases let the Hub download selected apps without embedding a GitHub token. The code and release assets will be public.

- Publish the Hub by updating its version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, refreshing `package-lock.json` with `npm install --package-lock-only`, and running `cargo check --manifest-path src-tauri/Cargo.toml`. Then push a matching `hub-v<version>` tag (first version: `hub-v0.2.0`). The workflow builds a Windows MSI and publishes the signed updater metadata.
- The standalone app source is also in `apps/Limon-Calculator/`. Copy that directory's contents to the root of the public `Limon-Digital-Technologies/LimonDT-Calculator` repository (preserve its existing `LICENSE`). Its root `.github/workflows/release.yml` builds and publishes the app when a matching `v<version>` tag is pushed (first tag: `v1.0.0`). The workflow attaches a Windows MSI and SHA-256 checksum to a stable app release.
- Users download only the Hub MSI first. From the Hub, they can download only the app they choose.

### Enable signed Hub auto-updates

Tauri updates are signed so the Hub can verify an update before installing it. Generate a key pair locally:

```powershell
npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\limondt-hub.key"
```

In the repository's **Settings → Secrets and variables → Actions**, add:

- Secret `TAURI_SIGNING_PRIVATE_KEY` with the contents of the generated private key file.
- Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` with its password, if one was set.
- Repository variable `TAURI_UPDATER_PUBLIC_KEY` with the public key printed by the signer.

Keep the private key out of the repository and never send it in chat. The Hub release workflow reads these settings, enables updater artifact signing for release builds, and uploads `latest.json`. Local builds remain possible without the signing key. Existing Hub installs need to be updated once manually to a signed updater-enabled release; later Hub versions can be installed from the in-app update banner.

Run Hub tests with `npm test`; run calculator tests with `npm --prefix apps/Limon-Calculator test`. To build the standalone calculator locally, use `npm --prefix apps/Limon-Calculator run tauri -- build`.
