import { defineConfig } from "vitest/config";

// `pnpm test` from the root runs every package's tests and the app's, each under its own config.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/web"],
  },
});
