import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const proxy = {
  "/api": {
    target: "http://127.0.0.1:8000",
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Public tunnel (cloudflared) ke liye - host header allow karna zaroori hai.
    allowedHosts: true,
    proxy,
  },
  // Production build bhi same port pe serve hoti hai, proxy ke saath.
  // Mobile ke liye dev server unreliable hota hai, isliye `npm run serve`.
  preview: {
    port: 4173,
    allowedHosts: true,
    proxy,
  },
});