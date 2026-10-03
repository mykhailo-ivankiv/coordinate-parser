import type {
  GridReferenceFormat,
  MGRSCoordinate,
  UCS2000Coordinate,
  UCS2000Format,
  USNGCoordinate,
  UTMCoordinate,
  UTMFormat,
  WGS84Coordinate,
  WGS84Format,
  WrittenCoordinate,
} from "@coordinate-parser/types";
import { choice, lookAhead, type Parser, possibly, regex, sequenceOf } from "arcsecond";
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

// The public parsers, one per coordinate system, each reporting the coordinate and how it was
// written. The grammars underneath read the data; the format is either which grammar matched, for
// WGS 84, or read off the text itself, for the grids, whose written forms differ only in spacing.

const inWGS84 =
  (format: WGS84Format) =>
  (coords: Coordinates): { coordinate: WGS84Coordinate; format: WGS84Format } => ({
    coordinate: { system: "WGS84", ...coords },
    format,
  });

/**
 * WGS 84 latitude and longitude in any of its formats: signed decimal degrees, with a point or a
 * comma, and the hemisphere-letter notations DD, DDM and DMS. A pair whose first value is not a valid
 * latitude is read longitude first; one valid both ways is read latitude first.
 *
 * @example
 * ```ts
 * wgs84Parser.run(`50° 27' 0.36"N, 30° 31' 24.24"E`).result
 * // → { coordinate: { system: "WGS84", latitude: 50.4501, longitude: 30.5234 }, format: "DMS" }
 * wgs84Parser.run("50,4501 30,5234").result.format
 * // → "decimal"
 * wgs84Parser.run("151.2093, -33.8688").result.format
 * // → "decimalLongitudeFirst"
 * ```
 */
export const wgs84Parser: Parser<{ coordinate: WGS84Coordinate; format: WGS84Format }> = choice([
  WGS84parser.map(inWGS84("decimal")),
  WGS84Rparser.map(inWGS84("decimalLongitudeFirst")),
  EuropeanWGS84parser.map(inWGS84("decimal")),
  EuropeanWGS84Rparser.map(inWGS84("decimalLongitudeFirst")),
  DDparser.map(inWGS84("DD")),
  DDMparser.map(inWGS84("DDM")),
  DMSparser.map(inWGS84("DMS")),
]);

// The whole input, read ahead without consuming it. `possibly`, because on an empty input the regex
// would fail with its own message and hide the grammar's.
const inputText = possibly(lookAhead(regex(/^[\s\S]*/))).map((text) => (text ?? "").trim());

const spacing = (text: string) => (/\s/.test(text) ? "spaced" : "compact");

/**
 * An MGRS reference, from a bare 100 km square down to 1 m, written solid or spaced.
 *
 * @example
 * ```ts
 * mgrsParser.run("4Q FJ 12345 67890").result
 * // → { coordinate: { system: "MGRS", zone: 4, band: "Q", square: "FJ", easting: 12345, northing: 67890, precision: 1 }, format: "spaced" }
 * ```
 */
export const mgrsParser: Parser<{ coordinate: MGRSCoordinate; format: GridReferenceFormat }> =
  sequenceOf([inputText, MGRSparser]).map(([text, reference]) => ({
    coordinate: { system: "MGRS", ...reference },
    format: spacing(text),
  }));

/**
 * A USNG reference: the MGRS grid, but with at least one digit per axis, so its coarsest square is
 * 10 km.
 *
 * @example
 * ```ts
 * usngParser.run("10S GJ 06832 44683").result.coordinate.system
 * // → "USNG"
 * usngParser.run("10S GJ").isError
 * // → true
 * ```
 */
export const usngParser: Parser<{ coordinate: USNGCoordinate; format: GridReferenceFormat }> =
  sequenceOf([inputText, USNGparser]).map(([text, reference]) => ({
    coordinate: { system: "USNG", ...reference },
    format: spacing(text),
  }));

/**
 * A UTM position: zone, latitude band, 6-digit easting and up to 7-digit northing, spaced or written
 * as one run. The hemisphere is taken from the band.
 *
 * @example
 * ```ts
 * utmParser.run("36U 324182 5591608").result
 * // → { coordinate: { system: "UTM", zone: 36, band: "U", hemisphere: "N", easting: 324182, northing: 5591608 }, format: "spaced" }
 * utmParser.run("17T6300844833438").result.format
 * // → "compact"
 * ```
 */
export const utmParser: Parser<{ coordinate: UTMCoordinate; format: UTMFormat }> = sequenceOf([
  inputText,
  UTMparser,
]).map(([text, position]) => ({
  coordinate: { system: "UTM", ...position },
  format: spacing(text),
}));

/**
 * UCS-2000 rectangular coordinates, X then Y, with the zone as the first digit of Y. Groups may be
 * split with a hyphen for legibility: "55-91000".
 *
 * @example
 * ```ts
 * ucs2000Parser.run("55-91000 63-25000").result
 * // → { coordinate: { system: "UCS-2000", zone: 6, northing: 5591000, easting: 325000 }, format: "grouped" }
 * ```
 */
export const ucs2000Parser: Parser<{ coordinate: UCS2000Coordinate; format: UCS2000Format }> =
  sequenceOf([inputText, UCS2000parser]).map(([text, position]) => ({
    coordinate: { system: "UCS-2000", ...position },
    // A hyphen between digits splits a group; a leading one would be a sign.
    format: /\d-\d/.test(text) ? "grouped" : "plain",
  }));

/**
 * Reads a coordinate in any supported system and format, and reports both. Systems are tried in a
 * fixed order — WGS 84, MGRS, UCS-2000, UTM — and the first that accepts the whole input wins. USNG is
 * never reported: MGRS reads the same strings first, so a USNG reference comes back as MGRS.
 *
 * `run` never throws: it returns `{ isError: false, result }` or `{ isError: true, error }`, where
 * `error` names the position and what was expected there.
 *
 * @example
 * ```ts
 * coordinateParser.run("50.4501, 30.5234").result
 * // → { coordinate: { system: "WGS84", latitude: 50.4501, longitude: 30.5234 }, format: "decimal" }
 * coordinateParser.run("36UUA2418291607").result
 * // → { coordinate: { system: "MGRS", zone: 36, band: "U", square: "UA", easting: 24182, northing: 91607, precision: 1 }, format: "compact" }
 * coordinateParser.run("91, 30").result.format
 * // → "decimalLongitudeFirst"
 * coordinateParser.run("50.4501; 30.5234").error
 * // → "ParseError (position 7): Expecting ',' or whitespace between the two values"
 * ```
 */
export const coordinateParser: Parser<WrittenCoordinate> = choice([
  wgs84Parser,
  mgrsParser,
  ucs2000Parser,
  // The latitude-band reading of UTM, matching MGRS above. UTMHemisphereParser, the EPSG reading of
  // "17N"/"17S", is not offered: this parser already accepts every string that one does.
  utmParser,
]);
