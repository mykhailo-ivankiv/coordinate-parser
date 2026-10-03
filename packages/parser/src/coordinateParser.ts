import { choice, type Parser } from "arcsecond";
import type { CoordinateOf, CoordinateSystem } from "./coordinateSystem.ts";
import { EuropeanWGS84parser } from "./EuropeanWGS84parser.ts";
import { EuropeanWGS84Rparser } from "./EuropeanWGS84Rparser.ts";
import { WGS84parser } from "./WGS84parser.ts";
import { WGS84Rparser } from "./WGS84Rparser.ts";
import { DDMparser } from "./DDMparser.ts";
import { DDparser } from "./DDparser.ts";
import { DMSparser } from "./DMSparser.ts";
import { MGRSparser } from "./MGRSparser.ts";
import { UCS2000parser } from "./UCS2000parser.ts";
import { USNGparser } from "./USNGparser.ts";
import { UTMparser } from "./UTMparser.ts";

/**
 * Reads a coordinate in any supported notation and reports which one it was. Systems are tried in
 * a fixed order — WGS84, WGS84R, DD, DDM, DMS, MGRS, UCS-2000, UTM — and the first that accepts
 * the whole input wins. Two consequences: USNG is never reported, because MGRS reads the same
 * strings first, and a pair whose first value is not a valid latitude is read as WGS84R. The
 * reversed order only gets a turn once the straight one has failed, so a pair valid both ways is
 * read latitude first.
 *
 * `run` never throws: it returns `{ isError: false, result }` or `{ isError: true, error }`, where
 * `error` names the position and what was expected there.
 *
 * @example
 * ```ts
 * coordinateParser.run("50.4501, 30.5234").result
 * // → { latitude: 50.4501, longitude: 30.5234, system: "WGS84" }
 * coordinateParser.run("36UUA2418291607").result
 * // → { zone: 36, band: "U", square: "UA", easting: 24182, northing: 91607, precision: 1, system: "MGRS" }
 * coordinateParser.run("91, 30").result
 * // → { latitude: 30, longitude: 91, system: "WGS84R" }
 * coordinateParser.run("50.4501; 30.5234").error
 * // → "ParseError (position 7): Expecting ',' or whitespace between the two values"
 * ```
 */
export const coordinateParser: Parser<CoordinateOf<Exclude<CoordinateSystem, "USNG">>> = choice([
  WGS84parser.map((coords) => ({ ...coords, system: "WGS84" as const })),
  WGS84Rparser.map((coords) => ({ ...coords, system: "WGS84R" as const })),
  EuropeanWGS84parser.map((coords) => ({ ...coords, system: "WGS84" as const })),
  EuropeanWGS84Rparser.map((coords) => ({ ...coords, system: "WGS84R" as const })),
  // Disjoint from the signed notations above: DD requires a hemisphere letter, and disjoint
  // from UTM below, whose eastings always exceed a longitude.
  DDparser.map((coords) => ({ ...coords, system: "DD" as const })),
  // Disjoint from DD and from each other: DDM needs a minute mark, DMS needs a second mark
  // on top of it, and DMS takes whole minutes where DDM takes decimal ones.
  DDMparser.map((coords) => ({ ...coords, system: "DDM" as const })),
  DMSparser.map((coords) => ({ ...coords, system: "DMS" as const })),
  MGRSparser.map((coords) => ({ ...coords, system: "MGRS" as const })),
  UCS2000parser.map((coords) => ({ ...coords, system: "UCS-2000" as const })),
  // The latitude-band reading of UTM, matching MGRS and USNG above. Putting UTMHemisphereParser
  // ahead of this line switches "17N"/"17S" to the EPSG reading; behind it, it never runs, since
  // this parser already accepts every string that one does.
  UTMparser.map((coords) => ({ ...coords, system: "UTM" as const })),
]);

/**
 * One parser per system, for when the caller already knows which system the input is in. Nothing
 * competes here, so the readings coordinateParser can never report are reachable: USNG, which MGRS
 * claims first, and a WGS84R pair whose longitude would also pass as a latitude.
 *
 * @example
 * ```ts
 * systemParsers.USNG.run("10S GJ 06832 44683").result.system
 * // → "USNG"
 * systemParsers.WGS84R.run("30.5234, 50.4501").result
 * // → { latitude: 50.4501, longitude: 30.5234, system: "WGS84R" }
 * ```
 */
export const systemParsers: { [S in CoordinateSystem]: Parser<CoordinateOf<S>> } = {
  WGS84: choice([WGS84parser, EuropeanWGS84parser]).map((coords) => ({
    ...coords,
    system: "WGS84" as const,
  })),
  WGS84R: choice([WGS84Rparser, EuropeanWGS84Rparser]).map((coords) => ({
    ...coords,
    system: "WGS84R" as const,
  })),
  DD: DDparser.map((coords) => ({ ...coords, system: "DD" as const })),
  DDM: DDMparser.map((coords) => ({ ...coords, system: "DDM" as const })),
  DMS: DMSparser.map((coords) => ({ ...coords, system: "DMS" as const })),
  MGRS: MGRSparser.map((coords) => ({ ...coords, system: "MGRS" as const })),
  USNG: USNGparser.map((coords) => ({ ...coords, system: "USNG" as const })),
  UTM: UTMparser.map((coords) => ({ ...coords, system: "UTM" as const })),
  "UCS-2000": UCS2000parser.map((coords) => ({ ...coords, system: "UCS-2000" as const })),
};

/**
 * WGS 84 latitude and longitude in any notation that puts latitude first: signed decimals, with a
 * point or a comma, and the hemisphere-letter notations DD, DDM and DMS. WGS84R is left out — once
 * the system is known to be WGS 84, a longitude-first pair is far likelier a mistake than a choice.
 * The result still says which notation matched.
 *
 * @example
 * ```ts
 * latitudeLongitudeParser.run(`50°27'0.36"N, 30°31'24.24"E`).result
 * // → { latitude: 50.4501, longitude: 30.5234, system: "DMS" }
 * latitudeLongitudeParser.run("151.2093, -33.8688").error
 * // → "latitude must be between -90 and 90, but got 151.2093"
 * ```
 */
export const latitudeLongitudeParser: Parser<CoordinateOf<"WGS84" | "DD" | "DDM" | "DMS">> = choice(
  [systemParsers.WGS84, systemParsers.DD, systemParsers.DDM, systemParsers.DMS],
);
