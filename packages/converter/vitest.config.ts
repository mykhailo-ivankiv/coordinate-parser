import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The dense reference sweeps take a while; they run on their own with `pnpm test:slow`.
    exclude: [...configDefaults.exclude, "**/*.slow.test.ts"],
  },
});
