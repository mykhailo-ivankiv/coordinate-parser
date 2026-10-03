import type { Coordinates, CoordinateSystem, SystemCoordinate } from "@coordinate-parser/parser";
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

/** Every system, in the order toAllSystems reports them. */
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

/** The rectangular grids: systems with a projection behind them, as opposed to an angle pair. */
export const GRID_SYSTEMS: CoordinateSystem[] = ["MGRS", "USNG", "UTM", "UCS-2000"];

/** The systems whose references can be written coarser than a metre. */
export const GRID_PRECISION_SYSTEMS: CoordinateSystem[] = ["MGRS", "USNG"];

/**
 * The area a parsed coordinate designates, in WGS 84: a point for the latitude/longitude
 * notations, a square for the grid references.
 *
 * @param parsed - A coordinate as coordinateParser or systemParsers return it.
 * @returns The point, or the square with its corners and outline.
 * @throws RangeError on a reference the parser accepts but no place matches: an MGRS column letter
 * not used in its zone, or a band that contradicts the northing.
 *
 * @example
 * ```ts
 * areaOf(coordinateParser.run("36UUA2491").result).size
 * // → 1000
 * areaOf(coordinateParser.run("36UUA2491").result).corners.southWest
 * // → { latitude: 50.4445861, longitude: 30.5211213 }
 * areaOf(coordinateParser.run("17N 630084 4833438").result)
 * // throws RangeError
 * ```
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

/**
 * Any parsed coordinate to the WGS 84 latitude/longitude it is stored as: the centre of the area it
 * designates, to seven decimal places.
 *
 * @param parsed - A coordinate as coordinateParser or systemParsers return it.
 * @returns Latitude and longitude in decimal degrees.
 * @throws RangeError where areaOf does.
 *
 * @example
 * ```ts
 * toWGS84(coordinateParser.run("36UUA2491").result)
 * // → { latitude: 50.4492283, longitude: 30.5279224 }
 * toWGS84(coordinateParser.run("50° 27.006'N, 30° 31.404'E").result)
 * // → { latitude: 50.4501, longitude: 30.5234 }
 * ```
 */
export const toWGS84 = (parsed: SystemCoordinate): Coordinates => areaOf(parsed).centre;

/** Options for fromWGS84, tryFromWGS84 and toAllSystems. */
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

/**
 * A parsed or encoded coordinate written out, in a form the system's parser reads back.
 *
 * @param coordinate - The coordinate to write, in the system its `system` names.
 * @returns The written value.
 *
 * @example
 * ```ts
 * format({ system: "DMS", latitude: 50.4501, longitude: 30.5234 })
 * // → `50° 27' 0.36"N, 30° 31' 24.24"E`
 * ```
 */
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

/** A point written in one system, with the area that writing designates. */
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
 * WGS 84 latitude/longitude in `system`: the written value, plus the area it designates.
 *
 * @param coords - The point, WGS 84 latitude and longitude.
 * @param system - The system to write it in.
 * @param options - The MGRS or USNG precision; 1 m unless given.
 * @returns The written value and the area it designates.
 * @throws RangeError where the system does not reach the point: UTM, MGRS and USNG stop short of
 * the poles, and UCS-2000 ends outside its zones 4-7. Also for USNG at a precision of 100000, which
 * USNG cannot write.
 *
 * @example
 * ```ts
 * fromWGS84({ latitude: 50.4501, longitude: 30.5234 }, "UCS-2000").value
 * // → "5593954 6324226"
 * fromWGS84({ latitude: 50.4501, longitude: 30.5234 }, "MGRS", { precision: 1000 }).value
 * // → "36UUA2491"
 * fromWGS84({ latitude: 89, longitude: 0 }, "UTM")
 * // throws RangeError
 * ```
 */
export const fromWGS84 = (
  coords: Coordinates,
  system: CoordinateSystem,
  options: ConversionOptions = {},
): Converted => {
  const { precision = 1 } = options;
  const point = toDeclaredPrecision(coords);
  const encoded = encode(point, system, precision);
  const converted: Converted = { system, value: format(encoded), area: areaOf(encoded) };
  if (system === "UCS-2000" && !insideUcs2000AreaOfUse(point)) converted.outsideAreaOfUse = true;
  return converted;
};

/** A Converted value, or the reason the system cannot express the point. */
export type Conversion = Converted | { system: CoordinateSystem; error: string };

/**
 * Like fromWGS84, but reports a system that cannot express the point instead of throwing.
 *
 * @param coords - The point, WGS 84 latitude and longitude.
 * @param system - The system to write it in.
 * @param options - The MGRS or USNG precision; 1 m unless given.
 * @returns The conversion, or `{ system, error }` with the reason.
 *
 * @example
 * ```ts
 * tryFromWGS84({ latitude: 89, longitude: 0 }, "UTM")
 * // → { system: "UTM", error: "UTM covers latitudes -80° to 84°, but got 89°; the polar caps belong to UPS, which is not supported" }
 * ```
 */
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

/**
 * The point in every supported system, with the reason wherever one cannot express it.
 *
 * @param coords - The point, WGS 84 latitude and longitude.
 * @param options - The MGRS and USNG precision; 1 m unless given.
 * @returns One conversion per system, in the order of CONVERTIBLE_SYSTEMS.
 *
 * @example
 * ```ts
 * toAllSystems({ latitude: 50.4501, longitude: 30.5234 }).map((c) => c.value)
 * // → ["50.4501, 30.5234", "30.5234, 50.4501", "50.4501°N, 30.5234°E", "50° 27.006'N, 30° 31.404'E", `50° 27' 0.36"N, 30° 31' 24.24"E`, "36UUA2418291607", "36U UA 24182 91607", "36U 324182 5591608", "5593954 6324226"]
 * ```
 */
export const toAllSystems = (coords: Coordinates, options?: ConversionOptions): Conversion[] =>
  CONVERTIBLE_SYSTEMS.map((system) => tryFromWGS84(coords, system, options));
