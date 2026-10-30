import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1421,
    strictPort: true,
  },
  build: {
    target: "chrome105",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
});
