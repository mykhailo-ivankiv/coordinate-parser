import type { Plugin } from "vite";
import { extractApiDocs } from "./extract.ts";

const MODULE_ID = "virtual:api-docs";
const RESOLVED_ID = `\0${MODULE_ID}`;

// What the public surface is made of: a change here can change the reference.
const DOCUMENTED_SOURCE = /\/src\/(api\.ts|parsers\/|converters\/)/;

/**
 * Serves `virtual:api-docs`, the API reference extracted from src/api.ts. It is generated whenever
 * the module is first loaded — on every build, and on demand in dev — so there is no generated file
 * to commit or forget to refresh. In dev, editing a documented source reloads the page.
 */
export const apiDocs = (): Plugin => ({
  name: "api-docs",
  resolveId: (id) => (id === MODULE_ID ? RESOLVED_ID : undefined),
  load: async (id) =>
    id === RESOLVED_ID ? `export default ${JSON.stringify(await extractApiDocs())};` : undefined,
  handleHotUpdate({ file, server }) {
    if (!DOCUMENTED_SOURCE.test(file) || file.endsWith(".test.ts")) return;
    const module = server.moduleGraph.getModuleById(RESOLVED_ID);
    if (!module) return;
    server.moduleGraph.invalidateModule(module);
    server.ws.send({ type: "full-reload" });
  },
});
