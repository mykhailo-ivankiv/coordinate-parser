import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { apiDocs } from "./apiDocs/vitePlugin.ts";

// https://vite.dev/config/
export default defineConfig({
  base: "/coordinate-toolkit/",
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss(), apiDocs()],
});
