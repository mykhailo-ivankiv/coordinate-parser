import { configDefaults } from "vitest/config";
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { apiDocs } from "./apiDocs/vitePlugin.ts";

// https://vite.dev/config/
export default defineConfig({
  base: "/coordinate-parser/",
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss(), apiDocs()],
  test: {
    // The dense reference sweeps take a while; they run on their own with `pnpm test:slow`.
    exclude: [...configDefaults.exclude, "**/*.slow.test.ts"],
  },
});
