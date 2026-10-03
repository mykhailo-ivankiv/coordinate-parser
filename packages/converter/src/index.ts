// The converter package's public surface: whatever is exported here is documented on the API page.
export * from "./coordinateConverter.ts";
export { type Coverage, coveringSquares, MAX_COVERING_SQUARES } from "./coverage.ts";
export {
  type Box,
  GRID_SPACINGS,
  type GridLabel,
  type GridLine,
  type GridSpacing,
  type GridZone,
  gridZones,
  mgrsGrid,
  spacingFor,
  zoneSeams,
} from "./gridOverlay.ts";
export { toDeclaredPrecision } from "./precision.ts";
export {
  insideUcs2000AreaOfUse,
  UCS2000_STRIPS,
  UCS2000_ZONE_AREAS,
  type ZoneArea,
} from "./UCS2000converter.ts";
