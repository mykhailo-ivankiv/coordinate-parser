import type {
  CoordinateSystem,
  WGS84Coordinate,
  WGS84Format,
  WrittenCoordinate,
} from "@coordinate-parser/types";

// How a system and a format are named on the page, shared by the parser and the converter.

// A WrittenCoordinate narrows by its own `format`, not by `coordinate.system` nested inside it, so
// asking "is this WGS 84?" and getting the format typed along with it takes a guard.
export const isWGS84 = (
  written: WrittenCoordinate,
): written is { coordinate: WGS84Coordinate; format: WGS84Format } =>
  written.coordinate.system === "WGS84";

const formatLabels: Record<WGS84Format, string> = {
  decimal: "десяткові",
  decimalLongitudeFirst: "довгота першою",
  DD: "DD",
  DDM: "DDM",
  DMS: "DMS",
};

export const systemLabel = (system: CoordinateSystem) =>
  system === "WGS84" ? "WGS 84" : system === "UCS-2000" ? "УСК-2000" : system;

/** The system, and for WGS 84 also how it was written: "WGS 84 · DMS", "MGRS", "УСК-2000". */
export const labelOf = (written: WrittenCoordinate) =>
  isWGS84(written)
    ? `WGS 84 · ${formatLabels[written.format]}`
    : systemLabel(written.coordinate.system);
