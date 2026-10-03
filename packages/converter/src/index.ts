// The converter package's public surface: whatever is exported here is documented on the API page.
// The coordinate types it takes and returns live in @coordinate-parser/types.
export {
  type Area,
  areaOf,
  type ConversionOptions,
  type Corners,
  fromWGS84,
  type GridPrecision,
  toAllSystems,
  toWGS84,
  tryFromWGS84,
} from "./coordinateConverter.ts";
export { type Coverage, coveringSquares } from "./coverage.ts";
export {
  type Box,
  type GridLabel,
  type GridLine,
  type GridSpacing,
  type GridZone,
  gridZones,
  mgrsGrid,
  spacingFor,
  zoneSeams,
} from "./gridOverlay.ts";
export { toDeclaredPrecision } from "./area.ts";
export { insideUcs2000AreaOfUse, type Ucs2000Zone, ucs2000Zones } from "./UCS2000converter.ts";
