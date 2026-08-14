import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    sourcemap: false,
    outDir: "dist",
    assetsDir: "assets",
  },
  server: {
    host: true,
    port: 5173,
  },
});