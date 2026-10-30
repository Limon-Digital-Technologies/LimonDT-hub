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

## Publish from the shared ecosystem repository

The app is released from the public `Limon-Digital-Technologies/LimonDT-hub` repository. The root workflow builds it when a version tag is pushed:

```powershell
git tag calculator-v1.0.0
git push origin calculator-v1.0.0
```

GitHub Actions publishes `Limon-Calculator-windows-x64.msi` and its SHA-256 checksum to a separate prerelease. The Hub finds the latest `calculator-v*` release, verifies the installer, and adds it to the signed-in user's library.
