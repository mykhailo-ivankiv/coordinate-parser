import type { Coordinate, CoordinateSystem, WGS84Coordinate } from "@coordinate-parser/types";
import { type Area, pointArea, toDeclaredPrecision } from "./area.ts";
import { type GridPrecision, mgrsArea, toMGRS, toUSNG } from "./MGRSconverter.ts";
import { toUCS2000, ucs2000Area } from "./UCS2000converter.ts";
import { toUTM, utmArea } from "./UTMconverter.ts";

// WGS 84 latitude/longitude is the pivot: every system converts to it and from it, and it is the
// form coordinates are stored in. Converting between any two other systems is the two halves
// chained, `fromWGS84(toWGS84(coordinate), system)`. Only data goes in and out; writing a coordinate
// as text is the formatter's job.
//
// A grid reference names a square, not a point: areaOf gives its corners, which say how far the
// stored centre can be from the truth. See area.ts.

export type { Area, Corners } from "./area.ts";
export type { GridPrecision } from "./MGRSconverter.ts";

/** Every system, in the order toAllSystems reports them. */
const SYSTEMS: CoordinateSystem[] = ["WGS84", "MGRS", "USNG", "UTM", "UCS-2000"];

/**
 * The area a coordinate designates, in WGS 84: a point for WGS 84 latitude and longitude, a square
 * for the grid references.
 *
 * @param coordinate - A coordinate in any system, such as the first element of a parser's result.
 * @returns The point, or the square with its corners and outline.
 * @throws RangeError on a reference the parser accepts but no place matches: an MGRS column letter
 * not used in its zone, or a band that contradicts the northing.
 *
 * @example
 * ```ts
 * areaOf(coordinateParser.run("36UUA2491").result[0]).size
 * // → 1000
 * areaOf(coordinateParser.run("36UUA2491").result[0]).corners.southWest
 * // → { system: "WGS84", latitude: 50.4445861, longitude: 30.5211213 }
 * areaOf(coordinateParser.run("17N 630084 4833438").result[0])
 * // throws RangeError
 * ```
 */
export const areaOf = (coordinate: Coordinate): Area => {
  switch (coordinate.system) {
    case "WGS84":
      return pointArea(coordinate);
    case "MGRS":
    case "USNG":
      return mgrsArea(coordinate);
    case "UTM":
      return utmArea(coordinate);
    case "UCS-2000":
      return ucs2000Area(coordinate);
  }
};

/**
 * A coordinate in any system to the WGS 84 latitude/longitude it is stored as: the centre of the
 * area it designates, to seven decimal places.
 *
 * @param coordinate - A coordinate in any system, such as the first element of a parser's result.
 * @returns The point, WGS 84 latitude and longitude.
 * @throws RangeError where areaOf does.
 *
 * @example
 * ```ts
 * toWGS84(coordinateParser.run("36UUA2491").result[0])
 * // → { system: "WGS84", latitude: 50.4492283, longitude: 30.5279224 }
 * toWGS84(coordinateParser.run("50° 27.006'N, 30° 31.404'E").result[0])
 * // → { system: "WGS84", latitude: 50.4501, longitude: 30.5234 }
 * ```
 */
export const toWGS84 = (coordinate: Coordinate): WGS84Coordinate => areaOf(coordinate).centre;

/** Options for fromWGS84, tryFromWGS84 and toAllSystems. */
export type ConversionOptions = {
  /** Side of the MGRS or USNG square to name, in metres. Defaults to 1. */
  precision?: GridPrecision;
};

const encode = (
  point: WGS84Coordinate,
  system: CoordinateSystem,
  precision: GridPrecision,
): Coordinate => {
  switch (system) {
    case "WGS84":
      return point;
    case "MGRS":
      return toMGRS(point, precision);
    case "USNG":
      if (precision === 100000) {
        throw new RangeError(
          "USNG requires at least one digit per axis, so its coarsest square is 10 km",
        );
      }
      return toUSNG(point, precision);
    case "UTM":
      return toUTM(point);
    case "UCS-2000":
      return toUCS2000(point);
  }
};

/**
 * A WGS 84 point in another system. For a grid that is the square the point falls in, as small as
 * `options.precision` asks for MGRS and USNG, 1 m otherwise.
 *
 * @param point - The point, WGS 84 latitude and longitude.
 * @param system - The system to convert it to.
 * @param options - The MGRS or USNG precision; 1 m unless given.
 * @returns The coordinate in `system`.
 * @throws RangeError where the system does not reach the point: UTM, MGRS and USNG stop short of
 * the poles, and UCS-2000 ends outside its zones 4-7. Also for USNG at a precision of 100000, which
 * USNG cannot express.
 *
 * @example
 * ```ts
 * fromWGS84({ system: "WGS84", latitude: 50.4501, longitude: 30.5234 }, "UCS-2000")
 * // → { system: "UCS-2000", zone: 6, northing: 5593954, easting: 324226 }
 * fromWGS84({ system: "WGS84", latitude: 50.4501, longitude: 30.5234 }, "MGRS", { precision: 1000 })
 * // → { system: "MGRS", zone: 36, band: "U", square: "UA", easting: 24000, northing: 91000, precision: 1000 }
 * fromWGS84({ system: "WGS84", latitude: 89, longitude: 0 }, "UTM")
 * // throws RangeError
 * ```
 */
export const fromWGS84 = <S extends CoordinateSystem>(
  point: WGS84Coordinate,
  system: S,
  options: ConversionOptions = {},
): Extract<Coordinate, { system: S }> =>
  // encode returns the member of `system`; TypeScript cannot follow a switch into a generic.
  encode(toDeclaredPrecision(point), system, options.precision ?? 1) as Extract<
    Coordinate,
    { system: S }
  >;

/**
 * Like fromWGS84, but reports a system that cannot express the point instead of throwing.
 *
 * @param point - The point, WGS 84 latitude and longitude.
 * @param system - The system to convert it to.
 * @param options - The MGRS or USNG precision; 1 m unless given.
 * @returns The coordinate in `system`, or `{ system, error }` with the reason.
 *
 * @example
 * ```ts
 * tryFromWGS84({ system: "WGS84", latitude: 89, longitude: 0 }, "UTM")
 * // → { system: "UTM", error: "UTM covers latitudes -80° to 84°, but got 89°; the polar caps belong to UPS, which is not supported" }
 * ```
 */
export const tryFromWGS84 = <S extends CoordinateSystem>(
  point: WGS84Coordinate,
  system: S,
  options?: ConversionOptions,
): Extract<Coordinate, { system: S }> | { system: S; error: string } => {
  try {
    return fromWGS84(point, system, options);
  } catch (error) {
    if (error instanceof RangeError) return { system, error: error.message };
    throw error;
  }
};

/**
 * The point in every system, with the reason wherever one cannot express it.
 *
 * @param point - The point, WGS 84 latitude and longitude.
 * @param options - The MGRS and USNG precision; 1 m unless given.
 * @returns One result per system: WGS84, MGRS, USNG, UTM, UCS-2000.
 *
 * @example
 * ```ts
 * toAllSystems({ system: "WGS84", latitude: 52.52, longitude: 13.405 }).map((result) => "error" in result)
 * // → [false, false, false, false, true]
 * ```
 */
export const toAllSystems = (
  point: WGS84Coordinate,
  options?: ConversionOptions,
): (Coordinate | { system: CoordinateSystem; error: string })[] =>
  SYSTEMS.map((system) => tryFromWGS84(point, system, options));
