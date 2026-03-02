import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  // Use relative paths for Electron production builds (file:// protocol)
  base: "./",
  plugins: [
    react(),
    electron({
      main: {
        // Main process entry point
        entry: "electron/main.ts",
        vite: {
          build: {
            outDir: "dist-electron",
          },
        },
      },
      preload: {
        // Preload script
        input: "electron/preload.ts",
        vite: {
          build: {
            outDir: "dist-electron",
          },
        },
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Ensure public assets are served correctly
  publicDir: "public",
  build: {
    outDir: "dist",
  },
});
