import { defineConfig } from "vite";

export default defineConfig({
  base: "/pulsefield/",
  build: {
    chunkSizeWarningLimit: 600,
  },
  server: {
    host: true,
    port: 5173,
    open: "/pulsefield/",
  },
  preview: {
    host: true,
    port: 4173,
  },
});
