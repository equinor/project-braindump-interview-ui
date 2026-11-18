import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  server: {
    headers: isolationHeaders,
  },
  preview: { headers: isolationHeaders },
});
