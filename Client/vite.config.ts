import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      // Same-origin defaults in dev: mirrors the Nginx setup in Docker.
      "/ws": {
        target: "http://localhost:8765",
        ws: true,
      },
      "/media": {
        target: "http://localhost:8766",
        rewrite: (mediaPath) => mediaPath.replace(/^\/media/, ""),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

