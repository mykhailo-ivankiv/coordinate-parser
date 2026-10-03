import { configDefaults, defineConfig } from "vitest/config";

// The slow suite only: the reference checks run densely over Ukraine and Russia, about a hundred
// million points spread over every core. See src/reference/slowSuite.ts.
export default defineConfig({
  test: {
    include: ["src/**/*.slow.test.ts"],
    exclude: configDefaults.exclude,
  },
});
