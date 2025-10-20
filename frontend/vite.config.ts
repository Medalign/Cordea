import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const baseUrl = env.VITE_API_BASE || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/guardrail": {
          target: baseUrl,
          changeOrigin: true,
        },
        "/trend": {
          target: baseUrl,
          changeOrigin: true,
        },
        "/references": {
          target: baseUrl,
          changeOrigin: true,
        },
        "/healthz": {
          target: baseUrl,
          changeOrigin: true,
        }
      }
    }
  };
});
