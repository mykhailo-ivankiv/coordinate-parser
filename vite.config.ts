import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  base: "/coordinate-parser/",
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
});
