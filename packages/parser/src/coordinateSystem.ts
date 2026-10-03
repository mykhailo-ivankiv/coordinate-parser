import type { Coordinates } from "./commonParsers.ts";
import type { MGRSCoordinate } from "./MGRSparser.ts";
import type { UCS2000Coordinate } from "./UCS2000parser.ts";
import type { USNGCoordinate } from "./USNGparser.ts";
import type { UTMCoordinate } from "./UTMparser.ts";

// What the parsers return, named once here: the converter package takes these same shapes.

/**
 * The name of a supported system, or of a notation of WGS 84 latitude and longitude.
 */
// Written out rather than derived as SystemCoordinate["system"], which TypeScript expands into the
// bare union wherever it is used, so signatures on the API page would lose the name. A name added
// here but not to SystemCoordinate breaks the converter's encode; keep the two lists in step.
export type CoordinateSystem =
  | "WGS84"
  | "WGS84R"
  | "DD"
  | "DDM"
  | "DMS"
  | "MGRS"
  | "USNG"
  | "UTM"
  | "UCS-2000";

/**
 * A coordinate as the parsers produce it and the converters take it, keyed by `system`. The
 * latitude/longitude notations share one shape; each grid has its own.
 */
export type SystemCoordinate =
  | (Coordinates & { system: "WGS84" | "WGS84R" | "DD" | "DDM" | "DMS" })
  | (MGRSCoordinate & { system: "MGRS" })
  | (USNGCoordinate & { system: "USNG" })
  | (UTMCoordinate & { system: "UTM" })
  | (UCS2000Coordinate & { system: "UCS-2000" });

/** A parsed coordinate of one particular system. */
export type CoordinateOf<S extends CoordinateSystem> = SystemCoordinate & { system: S };
