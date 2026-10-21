import { defineConfig } from "vite";
// No @vitejs/plugin-react: v5 failed on this Vite build ("Missing field moduleType"); plain esbuild JSX is enough here.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  server: { port: 5173, proxy: { "/api": "http://localhost:8787", "/mcp": "http://localhost:8787", "/health": "http://localhost:8787" } },
});
