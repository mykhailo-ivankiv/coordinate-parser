import type {
  CoordinateSystem,
  MGRSCoordinate,
  UCS2000Coordinate,
  UTMCoordinate,
  WGS84Coordinate,
} from "@coordinate-parser/types";

// How a system and a format are named on the page, shared by the parser and the converter.

const formatLabels = {
  WGS84: "десяткові",
  WGS84R: "довгота першою",
  DD: "DD",
  DDM: "DDM",
  DMS: "DMS",
};

export const systemLabel = (system: CoordinateSystem) =>
  system === "WGS84" ? "WGS 84" : system === "UCS-2000" ? "УСК-2000" : system;

/** The system, and for WGS 84 also how it was written: "WGS 84 · DMS", "MGRS", "УСК-2000". */
export const labelOf = (
  written:
    | [WGS84Coordinate, "WGS84" | "WGS84R" | "DD" | "DDM" | "DMS"]
    | [MGRSCoordinate]
    | [UTMCoordinate]
    | [UCS2000Coordinate],
) =>
  written.length === 2 ? `WGS 84 · ${formatLabels[written[1]]}` : systemLabel(written[0].system);
