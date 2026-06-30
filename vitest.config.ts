import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// Vitest configuration. Mirrors the `@/` alias from vite.config.ts so imports
// resolve identically under tests, and uses jsdom for component testing.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
