import type {
  MGRSCoordinate,
  UCS2000Coordinate,
  USNGCoordinate,
  UTMCoordinate,
  WGS84Coordinate,
} from "@coordinate-parser/types";
import { choice, type Parser } from "arcsecond";
import type { Coordinates } from "./commonParsers.ts";
import { DDMparser } from "./DDMparser.ts";
import { DDparser } from "./DDparser.ts";
import { DMSparser } from "./DMSparser.ts";
import { EuropeanWGS84parser } from "./EuropeanWGS84parser.ts";
import { EuropeanWGS84Rparser } from "./EuropeanWGS84Rparser.ts";
import { MGRSparser } from "./MGRSparser.ts";
import { UCS2000parser } from "./UCS2000parser.ts";
import { USNGparser } from "./USNGparser.ts";
import { UTMparser } from "./UTMparser.ts";
import { WGS84parser } from "./WGS84parser.ts";
import { WGS84Rparser } from "./WGS84Rparser.ts";

// The public parsers, one per notation. Each returns the coordinate in a tuple; the WGS 84 ones add
// which of its formats the text was in: [coordinate, format].

const inWGS84 =
  <F extends "WGS84" | "WGS84R" | "DD" | "DDM" | "DMS">(format: F) =>
  (coords: Coordinates): [WGS84Coordinate, F] => [{ system: "WGS84", ...coords }, format];

/**
 * Signed decimal degrees, latitude first. The two values are separated by a comma or whitespace;
 * with whitespace alone, a comma may also be the decimal mark.
 *
 * @example
 * ```ts
 * wgs84Parser.run("50,4501 30,5234").result
 * // → [{ system: "WGS84", latitude: 50.4501, longitude: 30.5234 }, "WGS84"]
 * ```
 */
export const wgs84Parser: Parser<[WGS84Coordinate, "WGS84"]> = choice([
  WGS84parser,
  EuropeanWGS84parser,
]).map(inWGS84("WGS84"));

/**
 * Signed decimal degrees, longitude first — the order of GeoJSON and most web map APIs.
 *
 * @example
 * ```ts
 * wgs84rParser.run("30.5234, 50.4501").result
 * // → [{ system: "WGS84", latitude: 50.4501, longitude: 30.5234 }, "WGS84R"]
 * ```
 */
export const wgs84rParser: Parser<[WGS84Coordinate, "WGS84R"]> = choice([
  WGS84Rparser,
  EuropeanWGS84Rparser,
]).map(inWGS84("WGS84R"));

/**
 * Decimal degrees with a hemisphere letter instead of a sign (ISO 6709 Annex D). The degree sign is
 * optional; a sign together with a letter is rejected.
 *
 * @example
 * ```ts
 * wgs84ddParser.run("33.8688°S, 151.2093°E").result
 * // → [{ system: "WGS84", latitude: -33.8688, longitude: 151.2093 }, "DD"]
 * ```
 */
export const wgs84ddParser: Parser<[WGS84Coordinate, "DD"]> = DDparser.map(inWGS84("DD"));

/**
 * Degrees and decimal minutes with a hemisphere letter. The minute mark is required; minutes must be
 * under 60.
 *
 * @example
 * ```ts
 * wgs84ddmParser.run("50° 27.006'N, 30° 31.404'E").result
 * // → [{ system: "WGS84", latitude: 50.4501, longitude: 30.5234 }, "DDM"]
 * ```
 */
export const wgs84ddmParser: Parser<[WGS84Coordinate, "DDM"]> = DDMparser.map(inWGS84("DDM"));

/**
 * Degrees, whole minutes and decimal seconds with a hemisphere letter. Seconds take a double quote,
 * two apostrophes or a double prime.
 *
 * @example
 * ```ts
 * wgs84dmsParser.run(`50° 27' 0.36"N, 30° 31' 24.24"E`).result
 * // → [{ system: "WGS84", latitude: 50.4501, longitude: 30.5234 }, "DMS"]
 * ```
 */
export const wgs84dmsParser: Parser<[WGS84Coordinate, "DMS"]> = DMSparser.map(inWGS84("DMS"));

/**
 * An MGRS reference, spaced or solid, from a bare 100 km square down to 1 m.
 *
 * @example
 * ```ts
 * mgrsParser.run("4Q FJ 12345 67890").result
 * // → [{ system: "MGRS", zone: 4, band: "Q", square: "FJ", easting: 12345, northing: 67890, precision: 1 }]
 * ```
 */
export const mgrsParser: Parser<[MGRSCoordinate]> = MGRSparser.map((reference) => [
  { system: "MGRS", ...reference },
]);

/**
 * A USNG reference: the MGRS grid, but with at least one digit per axis, so its coarsest square is
 * 10 km.
 *
 * @example
 * ```ts
 * usngParser.run("10S GJ 06832 44683").result[0].system
 * // → "USNG"
 * usngParser.run("10S GJ").isError
 * // → true
 * ```
 */
export const usngParser: Parser<[USNGCoordinate]> = USNGparser.map((reference) => [
  { system: "USNG", ...reference },
]);

/**
 * A UTM position: zone, latitude band, 6-digit easting and up to 7-digit northing, spaced or written
 * as one run. The hemisphere is taken from the band.
 *
 * @example
 * ```ts
 * utmParser.run("36U 324182 5591608").result
 * // → [{ system: "UTM", zone: 36, band: "U", hemisphere: "N", easting: 324182, northing: 5591608 }]
 * ```
 */
export const utmParser: Parser<[UTMCoordinate]> = UTMparser.map((position) => [
  { system: "UTM", ...position },
]);

/**
 * UCS-2000 rectangular coordinates, X then Y, with the zone as the first digit of Y. Groups may be
 * split with a hyphen for legibility: "55-91000".
 *
 * @example
 * ```ts
 * ucs2000Parser.run("55-91000 63-25000").result
 * // → [{ system: "UCS-2000", zone: 6, northing: 5591000, easting: 325000 }]
 * ```
 */
export const ucs2000Parser: Parser<[UCS2000Coordinate]> = UCS2000parser.map((position) => [
  { system: "UCS-2000", ...position },
]);

/**
 * Reads a coordinate in any supported notation, and for WGS 84 also reports which format it was in. Parsers are tried in a
 * fixed order — WGS 84 decimal latitude first, then longitude first, DD, DDM, DMS, MGRS, UCS-2000,
 * UTM — and the first that accepts the whole input wins. Two consequences: USNG is never reported,
 * because MGRS reads the same strings first, and a pair whose first value is not a valid latitude
 * is read longitude first.
 *
 * `run` never throws: it returns `{ isError: false, result }` or `{ isError: true, error }`, where
 * `error` names the position and what was expected there.
 *
 * @example
 * ```ts
 * coordinateParser.run("50.4501, 30.5234").result
 * // → [{ system: "WGS84", latitude: 50.4501, longitude: 30.5234 }, "WGS84"]
 * coordinateParser.run("36UUA2418291607").result
 * // → [{ system: "MGRS", zone: 36, band: "U", square: "UA", easting: 24182, northing: 91607, precision: 1 }]
 * coordinateParser.run("91, 30").result[1]
 * // → "WGS84R"
 * coordinateParser.run("50.4501; 30.5234").error
 * // → "ParseError (position 7): Expecting ',' or whitespace between the two values"
 * ```
 */
export const coordinateParser: Parser<
  | [WGS84Coordinate, "WGS84" | "WGS84R" | "DD" | "DDM" | "DMS"]
  | [MGRSCoordinate]
  | [USNGCoordinate]
  | [UTMCoordinate]
  | [UCS2000Coordinate]
> = choice([
  wgs84Parser,
  wgs84rParser,
  wgs84ddParser,
  wgs84ddmParser,
  wgs84dmsParser,
  mgrsParser,
  ucs2000Parser,
  // The latitude-band reading of UTM, matching MGRS above. UTMHemisphereParser, the EPSG reading of
  // "17N"/"17S", is not offered: this parser already accepts every string that one does.
  utmParser,
]);
