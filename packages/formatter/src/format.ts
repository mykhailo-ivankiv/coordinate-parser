import type {
  MGRSCoordinate,
  UCS2000Coordinate,
  USNGCoordinate,
  UTMCoordinate,
  WGS84Coordinate,
} from "@coordinate-parser/types";

// Coordinates written out, the inverse of the parser: every string here is one the matching parser
// reads back to the same coordinate.

// Seven decimal places, about a centimetre: as many as the parser accepts.
const MAX_FRACTION_DIGITS = 7;
const DEGREE_SIGN = "°";
// Digits per axis in the finest MGRS or USNG reference: 5, a 1 m square.
const MAX_DIGITS_PER_AXIS = 5;

// Fixed-point, with trailing zeros dropped: 50.4501 rather than 50.4501000.
const decimal = (value: number, fractionDigits: number) =>
  value.toFixed(fractionDigits).replace(/\.?0+$/, "");

/**
 * WGS 84 as signed decimal degrees, latitude first.
 *
 * @param coordinate - The point.
 * @returns The written point.
 *
 * @example
 * ```ts
 * formatWGS84({ system: "WGS84", latitude: 50.4501, longitude: 30.5234 })
 * // → "50.4501, 30.5234"
 * ```
 */
export const formatWGS84 = ({ latitude, longitude }: WGS84Coordinate) =>
  `${decimal(latitude, MAX_FRACTION_DIGITS)}, ${decimal(longitude, MAX_FRACTION_DIGITS)}`;

/**
 * WGS 84 as signed decimal degrees, longitude first.
 *
 * @param coordinate - The point.
 * @returns The written point.
 *
 * @example
 * ```ts
 * formatWGS84R({ system: "WGS84", latitude: 50.4501, longitude: 30.5234 })
 * // → "30.5234, 50.4501"
 * ```
 */
export const formatWGS84R = ({ latitude, longitude }: WGS84Coordinate) =>
  `${decimal(longitude, MAX_FRACTION_DIGITS)}, ${decimal(latitude, MAX_FRACTION_DIGITS)}`;

// Minutes and seconds are rounded as one integer count of their smallest unit and only then split,
// so a carry propagates: 59.9999" becomes a whole minute instead of the unparseable 60".
const MINUTE_FRACTION_DIGITS = 5; // 0.00001' ≈ 2 cm
const SECOND_FRACTION_DIGITS = 3; // 0.001" ≈ 3 cm

const toDD = (value: number) => `${decimal(Math.abs(value), MAX_FRACTION_DIGITS)}${DEGREE_SIGN}`;

const toDDM = (value: number) => {
  const unit = 10 ** MINUTE_FRACTION_DIGITS;
  const total = Math.round(Math.abs(value) * 60 * unit);
  const degrees = Math.floor(total / (60 * unit));
  const minutes = (total - degrees * 60 * unit) / unit;
  return `${degrees}${DEGREE_SIGN} ${decimal(minutes, MINUTE_FRACTION_DIGITS)}'`;
};

const toDMS = (value: number) => {
  const unit = 10 ** SECOND_FRACTION_DIGITS;
  const total = Math.round(Math.abs(value) * 3600 * unit);
  const degrees = Math.floor(total / (3600 * unit));
  const minutes = Math.floor((total - degrees * 3600 * unit) / (60 * unit));
  const seconds = (total - degrees * 3600 * unit - minutes * 60 * unit) / unit;
  return `${degrees}${DEGREE_SIGN} ${minutes}' ${decimal(seconds, SECOND_FRACTION_DIGITS)}"`;
};

const withHemispheres = (
  angle: (value: number) => string,
  { latitude, longitude }: WGS84Coordinate,
) =>
  `${angle(latitude)}${latitude < 0 ? "S" : "N"}, ${angle(longitude)}${longitude < 0 ? "W" : "E"}`;

/**
 * WGS 84 in decimal degrees with hemisphere letters (ISO 6709 Annex D).
 *
 * @param coordinate - The point.
 * @returns The written point.
 *
 * @example
 * ```ts
 * formatDD({ system: "WGS84", latitude: -33.8688, longitude: 151.2093 })
 * // → "33.8688°S, 151.2093°E"
 * ```
 */
export const formatDD = (coordinate: WGS84Coordinate) => withHemispheres(toDD, coordinate);

/**
 * WGS 84 in degrees and decimal minutes with hemisphere letters.
 *
 * @param coordinate - The point.
 * @returns The written point.
 *
 * @example
 * ```ts
 * formatDDM({ system: "WGS84", latitude: 50.4501, longitude: 30.5234 })
 * // → "50° 27.006'N, 30° 31.404'E"
 * ```
 */
export const formatDDM = (coordinate: WGS84Coordinate) => withHemispheres(toDDM, coordinate);

/**
 * WGS 84 in degrees, minutes and seconds with hemisphere letters.
 *
 * @param coordinate - The point.
 * @returns The written point.
 *
 * @example
 * ```ts
 * formatDMS({ system: "WGS84", latitude: 50.4501, longitude: 30.5234 })
 * // → `50° 27' 0.36"N, 30° 31' 24.24"E`
 * ```
 */
export const formatDMS = (coordinate: WGS84Coordinate) => withHemispheres(toDMS, coordinate);

// One axis of a grid reference: as many digits as the precision leaves, none for a 100 km square.
const digitsOf = (metres: number, precision: number) => {
  const width = MAX_DIGITS_PER_AXIS - Math.log10(precision);
  return width === 0 ? "" : String(metres / precision).padStart(width, "0");
};

/**
 * An MGRS reference in the compact form NGA.STND.0037 prints.
 *
 * @param coordinate - The reference.
 * @returns The written reference.
 *
 * @example
 * ```ts
 * formatMGRS({ system: "MGRS", zone: 4, band: "Q", square: "FJ", easting: 12000, northing: 67000, precision: 1000 })
 * // → "4QFJ1267"
 * ```
 */
export const formatMGRS = ({ zone, band, square, easting, northing, precision }: MGRSCoordinate) =>
  `${zone}${band}${square}${digitsOf(easting, precision)}${digitsOf(northing, precision)}`;

/**
 * A USNG reference in the spaced form FGDC-STD-011-2001 prescribes.
 *
 * @param coordinate - The reference.
 * @returns The written reference.
 *
 * @example
 * ```ts
 * formatUSNG({ system: "USNG", zone: 10, band: "S", square: "GJ", easting: 6832, northing: 44683, precision: 1 })
 * // → "10S GJ 06832 44683"
 * ```
 */
export const formatUSNG = ({ zone, band, square, easting, northing, precision }: USNGCoordinate) =>
  `${zone}${band} ${square} ${digitsOf(easting, precision)} ${digitsOf(northing, precision)}`;

/**
 * A UTM position: zone with its latitude band, or its hemisphere where it has no band, then easting
 * and northing.
 *
 * @param coordinate - The position.
 * @returns The written position.
 *
 * @example
 * ```ts
 * formatUTM({ system: "UTM", zone: 36, band: "U", hemisphere: "N", easting: 324182, northing: 5591608 })
 * // → "36U 324182 5591608"
 * ```
 */
export const formatUTM = ({ zone, band, hemisphere, easting, northing }: UTMCoordinate) =>
  `${zone}${band ?? hemisphere} ${easting} ${northing}`;

/**
 * UCS-2000 rectangular coordinates: X, then Y with the zone digit in front.
 *
 * @param coordinate - The position.
 * @returns The written position.
 *
 * @example
 * ```ts
 * formatUCS2000({ system: "UCS-2000", zone: 6, northing: 5593954, easting: 324226 })
 * // → "5593954 6324226"
 * ```
 */
export const formatUCS2000 = ({ zone, northing, easting }: UCS2000Coordinate) =>
  `${northing} ${zone}${String(easting).padStart(6, "0")}`;

/**
 * A coordinate written out, given as the parsers return it: `[coordinate, format]` for WGS 84,
 * `[coordinate]` for a grid. The inverse of coordinateParser.
 *
 * @param written - The coordinate, and for WGS 84 its format.
 * @returns The written coordinate.
 *
 * @example
 * ```ts
 * format([{ system: "WGS84", latitude: 50.4501, longitude: 30.5234 }, "DDM"])
 * // → "50° 27.006'N, 30° 31.404'E"
 * format(coordinateParser.run("36U UA 24182 91607").result)
 * // → "36UUA2418291607"
 * ```
 */
export const format = (
  written:
    | [WGS84Coordinate, "WGS84" | "WGS84R" | "DD" | "DDM" | "DMS"]
    | [MGRSCoordinate]
    | [USNGCoordinate]
    | [UTMCoordinate]
    | [UCS2000Coordinate],
): string => {
  if (written.length === 2) {
    const [coordinate, notation] = written;
    switch (notation) {
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
    }
  }
  const [coordinate] = written;
  switch (coordinate.system) {
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
