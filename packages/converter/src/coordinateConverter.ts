import type { Coordinate, CoordinateSystem, WGS84Coordinate } from "@coordinate-parser/types";
import { type Area, pointArea, toDeclaredPrecision } from "./area.ts";
import { mgrsArea, fromWgs84ToMgrs, fromWgs84ToUsng } from "./mgrs.ts";
import { fromWgs84ToUcs2000, ucs2000Area } from "./ucs2000.ts";
import { fromWgs84ToUtm, utmArea } from "./utm.ts";

// A grid reference names a square, not a point: areaOf gives its corners, which say how far the
// stored centre can be from the truth. See area.ts.
//
// fromWGS84 and toWGS84 pick the conversion by system. They are not public — the per-system
// functions in mgrs.ts, utm.ts and ucs2000.ts are — but coverage.ts and the tests need them.

export type { Area } from "./area.ts";

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
 * areaOf(coordinateParser.run("36UUA2491").result[0]).southWest
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

// Any coordinate as the WGS 84 point it is stored as: the centre of the area it designates.
export const toWGS84 = (coordinate: Coordinate): WGS84Coordinate => areaOf(coordinate).centre;

const encode = (
  point: WGS84Coordinate,
  system: CoordinateSystem,
  precision: 1 | 10 | 100 | 1000 | 10000 | 100000,
): Coordinate => {
  switch (system) {
    case "WGS84":
      return toDeclaredPrecision(point);
    case "MGRS":
      return fromWgs84ToMgrs(point, precision);
    case "USNG":
      return fromWgs84ToUsng(point, precision as 1 | 10 | 100 | 1000 | 10000);
    case "UTM":
      return fromWgs84ToUtm(point);
    case "UCS-2000":
      return fromWgs84ToUcs2000(point);
  }
};

// A WGS 84 point in `system`; throws a RangeError where the system does not reach it.
export const fromWGS84 = <S extends CoordinateSystem>(
  point: WGS84Coordinate,
  system: S,
  options: { precision?: 1 | 10 | 100 | 1000 | 10000 | 100000 } = {},
): Extract<Coordinate, { system: S }> =>
  // encode returns the member of `system`; TypeScript cannot follow a switch into a generic.
  encode(point, system, options.precision ?? 1) as Extract<Coordinate, { system: S }>;
