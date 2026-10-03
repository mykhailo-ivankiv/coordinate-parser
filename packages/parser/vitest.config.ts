import { defineConfig } from "vitest/config";

// Here so that `pnpm test` in this package runs this package alone, not the root's projects.
export default defineConfig({});
