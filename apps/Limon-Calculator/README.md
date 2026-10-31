# Limon Calculator

Standalone Windows desktop application built with Tauri 2, Vite, and JavaScript.

## Run and test locally

```powershell
npm ci
npm run test
npm run tauri -- dev
```

Create a Windows installer locally:

```powershell
npm run tauri -- build
```

The MSI is written under `src-tauri/target/release/bundle/msi/`.

## Publish from the standalone repository

The app is released from the public `Limon-Digital-Technologies/LimonDT-Calculator` repository. Copy the contents of this directory to that repository's root, preserving its existing `LICENSE`. The root workflow builds and publishes an MSI when a version tag is pushed:

```powershell
git tag v1.0.0
git push origin main
git push origin v1.0.0
```

GitHub Actions publishes `Limon-Calculator-windows-x64.msi` and its SHA-256 checksum to the stable release. The Hub verifies the installer and adds it to the signed-in user's library.
