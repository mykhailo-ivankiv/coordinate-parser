/// <reference types="node" />
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import config from "@arcgis/core/config.js";
import * as coordinateFormatter from "@arcgis/core/geometry/coordinateFormatter.js";
import proj4 from "proj4";

// The public libraries our conversions are checked against, set up to run under Node:
//
//   * proj4js, the JavaScript port of PROJ — the numbers. It runs the same transverse Mercator and
//     the same EPSG:5840 datum shift, so UTM and UCS-2000 must agree to the millimetre.
//   * ArcGIS Maps SDK for JavaScript, whose coordinate formatter runs on Esri's Projection Engine —
//     the written UTM, MGRS and USNG strings, and reading ours back.
//   * mgrs, the proj4js project's MGRS package — MGRS strings, and reading ours back.

export { coordinateFormatter };

// ArcGIS is built for the browser: it fetches its Projection Engine, pe-wasm.wasm, from its assets
// folder, and Node's fetch does not read file: URLs. The assets ship inside @arcgis/core, so the
// folder is pointed at this package's node_modules and fetch is taught to read local files.
const nativeFetch = globalThis.fetch;

const fetchLocalFiles = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  if (!url.startsWith("file:")) return nativeFetch(input, init);
  const type = url.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
  return new Response(await readFile(fileURLToPath(url)), { headers: { "content-type": type } });
}) as typeof fetch;

/** Loads ArcGIS's Projection Engine; call once per test file, before any ArcGIS check runs. */
export const loadArcgis = async () => {
  globalThis.fetch = fetchLocalFiles;
  // Relative to this file rather than the working directory, which is the repository root when the
  // tests run from there.
  config.assetsPath = new URL("../../node_modules/@arcgis/core/assets", import.meta.url).href;
  await coordinateFormatter.load();
  globalThis.fetch = nativeFetch;
};

const WGS84 = "EPSG:4326";

// proj4js definitions matching ours: UTM on WGS 84, and the UCS-2000 Gauss-Kruger zones with the
// EPSG:5840 shift written as a seven-parameter Helmert whose rotations and scale are zero.
const utmDefinition = (zone: number, hemisphere: "N" | "S") =>
  `+proj=utm +zone=${zone}${hemisphere === "S" ? " +south" : ""} +datum=WGS84 +units=m +no_defs`;

const ucs2000Definition = (zone: number) =>
  `+proj=tmerc +lat_0=0 +lon_0=${zone * 6 - 3} +k=1 +x_0=${zone * 1_000_000 + 500_000} +y_0=0 ` +
  "+ellps=krass +towgs84=24,-121,-76,0,0,0,0 +units=m +no_defs";

// Parsing a definition costs more than the projection itself, so each zone's converter is built once.
const converters = new Map<string, proj4.Converter>();
const converter = (definition: string) => {
  let found = converters.get(definition);
  if (found === undefined) {
    found = proj4(WGS84, definition);
    converters.set(definition, found);
  }
  return found;
};

export const proj4UTM = (zone: number, hemisphere: "N" | "S") =>
  converter(utmDefinition(zone, hemisphere));

export const proj4UCS2000 = (zone: number) => converter(ucs2000Definition(zone));
