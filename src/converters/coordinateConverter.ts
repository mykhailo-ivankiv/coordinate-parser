import type { Coordinates } from "../parsers/commonParsers.ts";
import type { MGRSCoordinate } from "../parsers/MGRSparser.ts";
import type { UCS2000Coordinate } from "../parsers/UCS2000parser.ts";
import type { USNGCoordinate } from "../parsers/USNGparser.ts";
import type { UTMCoordinate } from "../parsers/UTMparser.ts";
import { type Area, pointArea } from "./area.ts";
import {
  formatMGRS,
  formatUSNG,
  type GridPrecision,
  mgrsArea,
  toMGRS,
  toUSNG,
} from "./MGRSconverter.ts";
import { toDeclaredPrecision } from "./precision.ts";
import { formatDD, formatDDM, formatDMS, formatWGS84, formatWGS84R } from "./sexagesimalFormat.ts";
import {
  formatUCS2000,
  insideUcs2000AreaOfUse,
  toUCS2000,
  ucs2000Area,
} from "./UCS2000converter.ts";
import { formatUTM, toUTM, utmArea } from "./UTMconverter.ts";

// WGS 84 latitude/longitude is the pivot: every supported system converts to it and from it, and
// it is the form coordinates are stored in. Converting between any two other systems is the two
// halves chained, `fromWGS84(toWGS84(parsed), system)`.
//
// Both directions also describe the area a written value designates — see area.ts. A grid
// reference names a square, and its corners say how far the stored centre can be from the truth.

export type { Area, Corners } from "./area.ts";
export type { GridPrecision } from "./MGRSconverter.ts";

/** What coordinateParser produces, keyed by the `system` it reports. */
export type SystemCoordinate =
  | (Coordinates & { system: "WGS84" | "WGS84R" | "DD" | "DDM" | "DMS" })
  | (MGRSCoordinate & { system: "MGRS" })
  | (USNGCoordinate & { system: "USNG" })
  | (UTMCoordinate & { system: "UTM" })
  | (UCS2000Coordinate & { system: "UCS-2000" });

export type CoordinateSystem = SystemCoordinate["system"];

export const CONVERTIBLE_SYSTEMS: CoordinateSystem[] = [
  "WGS84",
  "WGS84R",
  "DD",
  "DDM",
  "DMS",
  "MGRS",
  "USNG",
  "UTM",
  "UCS-2000",
];

/**
 * WGS 84 latitude and longitude, written five ways. These are notations of one coordinate system,
 * not systems of their own: they share the datum and the angle, and converting between them is
 * only rewriting. Every other entry in CONVERTIBLE_SYSTEMS is a grid with a projection behind it.
 */
export const LATITUDE_LONGITUDE_NOTATIONS: CoordinateSystem[] = [
  "WGS84",
  "WGS84R",
  "DD",
  "DDM",
  "DMS",
];

export const GRID_SYSTEMS: CoordinateSystem[] = ["MGRS", "USNG", "UTM", "UCS-2000"];

/** The systems whose references can be written coarser than a metre. */
export const GRID_PRECISION_SYSTEMS: CoordinateSystem[] = ["MGRS", "USNG"];

/**
 * The area a parsed coordinate designates, in WGS 84: a point for the latitude/longitude
 * notations, a square for the grid references. Throws a RangeError on an impossible value.
 */
export const areaOf = (parsed: SystemCoordinate): Area => {
  switch (parsed.system) {
    case "WGS84":
    case "WGS84R":
    case "DD":
    case "DDM":
    case "DMS":
      return pointArea(parsed);
    case "MGRS":
    case "USNG":
      return mgrsArea(parsed);
    case "UTM":
      return utmArea(parsed);
    case "UCS-2000":
      return ucs2000Area(parsed);
  }
};

/** Any parsed coordinate to the WGS 84 latitude/longitude it is stored as: the area's centre. */
export const toWGS84 = (parsed: SystemCoordinate): Coordinates => areaOf(parsed).centre;

export type ConversionOptions = {
  /** Side of the MGRS or USNG square to name, in metres. Defaults to 1. */
  precision?: GridPrecision;
};

const encode = (
  coords: Coordinates,
  system: CoordinateSystem,
  precision: GridPrecision,
): SystemCoordinate => {
  switch (system) {
    case "WGS84":
    case "WGS84R":
    case "DD":
    case "DDM":
    case "DMS":
      return { ...coords, system };
    case "MGRS":
      return { ...toMGRS(coords, precision), system };
    case "USNG":
      if (precision === 100000) {
        throw new RangeError(
          "USNG requires at least one digit per axis, so its coarsest square is 10 km",
        );
      }
      return { ...toUSNG(coords, precision), system };
    case "UTM":
      return { ...toUTM(coords), system };
    case "UCS-2000":
      return { ...toUCS2000(coords), system };
  }
};

/** A parsed or encoded coordinate written out, in a form the system's parser reads back. */
export const format = (coordinate: SystemCoordinate): string => {
  switch (coordinate.system) {
    case "WGS84":
      return formatWGS84(coordinate);
    case "WGS84R":
      return formatWGS84R(coordinate);
    case "DD":
      return formatDD(coordinate);
    case "DDM":
      return formatDDM(coordinate);
    case "DMS":
      return formatDMS(coordinate);
    case "MGRS":
      return formatMGRS(coordinate);
    case "USNG":
      return formatUSNG(coordinate);
    case "UTM":
      return formatUTM(coordinate);
    case "UCS-2000":
      return formatUCS2000(coordinate);
  }
};

export type Converted = {
  system: CoordinateSystem;
  /** The point written in `system`. */
  value: string;
  /** What `value` designates, back in WGS 84: the square containing the point, for a grid. */
  area: Area;
  /**
   * Set for a UCS-2000 value outside the system's area of use, Ukraine. The value is computed all
   * the same, but the datum shift behind it is only defined there; see insideUcs2000AreaOfUse.
   */
  outsideAreaOfUse?: true;
};

/**
 * WGS 84 latitude/longitude in `system`: the written value, plus the area it designates. Throws a
 * RangeError where the system does not reach the point: UTM, MGRS and USNG stop short of the
 * poles, and UCS-2000 is defined over Ukraine only.
 */
export const fromWGS84 = (
  coords: Coordinates,
  system: CoordinateSystem,
  { precision = 1 }: ConversionOptions = {},
): Converted => {
  const point = toDeclaredPrecision(coords);
  const encoded = encode(point, system, precision);
  const converted: Converted = { system, value: format(encoded), area: areaOf(encoded) };
  if (system === "UCS-2000" && !insideUcs2000AreaOfUse(point)) converted.outsideAreaOfUse = true;
  return converted;
};

export type Conversion = Converted | { system: CoordinateSystem; error: string };

/** Like fromWGS84, but reports a system that cannot express the point instead of throwing. */
export const tryFromWGS84 = (
  coords: Coordinates,
  system: CoordinateSystem,
  options?: ConversionOptions,
): Conversion => {
  try {
    return fromWGS84(coords, system, options);
  } catch (error) {
    if (error instanceof RangeError) return { system, error: error.message };
    throw error;
  }
};

/** The point in every supported system, with the reason wherever one cannot express it. */
export const toAllSystems = (coords: Coordinates, options?: ConversionOptions): Conversion[] =>
  CONVERTIBLE_SYSTEMS.map((system) => tryFromWGS84(coords, system, options));
