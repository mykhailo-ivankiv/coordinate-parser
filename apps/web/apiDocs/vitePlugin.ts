import type { Plugin } from "vite";
import { extractApiDocs } from "./extract.ts";

const MODULE_ID = "virtual:api-docs";
const RESOLVED_ID = `\0${MODULE_ID}`;

// The documented packages' sources: a change there can change the reference.
const DOCUMENTED_SOURCE = /\/packages\/(types|parser|converter|formatter)\/src\//;

/**
 * Serves `virtual:api-docs`, the API reference of the parser and converter packages. It is generated whenever
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
