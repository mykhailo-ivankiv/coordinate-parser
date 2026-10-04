// The converter package's public surface: whatever is exported here is documented on the API page.
// The coordinate types it takes and returns live in @coordinate-parser/types.
export {
  type Area,
  areaOf,
  type ConversionOptions,
  type Corners,
  fromWGS84,
  toAllSystems,
  toWGS84,
  tryFromWGS84,
} from "./coordinateConverter.ts";
export {
  fromMgrsToWgs84,
  fromUsngToWgs84,
  fromWgs84ToMgrs,
  fromWgs84ToUsng,
  type GridPrecision,
} from "./mgrs.ts";
export { fromUtmToWgs84, fromWgs84ToUtm } from "./utm.ts";
export { fromUcs2000ToWgs84, fromWgs84ToUcs2000 } from "./ucs2000.ts";
export { type Coverage, coveringSquares } from "./coverage.ts";
export { toDeclaredPrecision } from "./area.ts";
