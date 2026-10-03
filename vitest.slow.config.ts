import { configDefaults, defineConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// The slow suite only: the reference checks run densely over Ukraine and Russia, about a hundred
// million points spread over every core. See src/converters/reference/slowSuite.ts.
//
// The `test` section replaces the main config's rather than merging with it: mergeConfig joins
// arrays, which would keep the main config's exclusion of exactly these files.
export default defineConfig({
  ...viteConfig,
  test: {
    include: ["src/**/*.slow.test.ts"],
    exclude: configDefaults.exclude,
  },
});
