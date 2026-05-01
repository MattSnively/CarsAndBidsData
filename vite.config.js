import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// On GitHub Pages, the site is served at /<repo-name>/ unless using a custom domain.
// Set VITE_BASE in the deploy workflow (or in .env) to "/<repo-name>/" for project pages,
// or "/" for user/org pages or a custom domain.
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: "dist",
    target: "es2020",
    sourcemap: false,
  },
});
