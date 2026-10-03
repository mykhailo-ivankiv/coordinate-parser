import type { Coordinates } from "@coordinate-parser/parser";
import { DEGREE_SIGN, MAX_FRACTION_DIGITS } from "./notation.ts";

// WGS 84 latitude/longitude written out in the notations that are only a spelling of it: the
// signed decimal pair, and the ISO 6709 Annex D family DD, DDM and DMS. No geodesy happens here —
// these share the datum and the angle, and differ only in how the angle is written. Each output is
// what the matching parser reads back to the same coordinates.

// Fixed-point, with trailing zeros dropped: 50.4501 rather than 50.4501000.
const decimal = (value: number, fractionDigits: number) =>
  value.toFixed(fractionDigits).replace(/\.?0+$/, "");

/** "50.4501, 30.5234" — latitude first. */
export const formatWGS84 = ({ latitude, longitude }: Coordinates) =>
  `${decimal(latitude, MAX_FRACTION_DIGITS)}, ${decimal(longitude, MAX_FRACTION_DIGITS)}`;

/** "30.5234, 50.4501" — longitude first. */
export const formatWGS84R = ({ latitude, longitude }: Coordinates) =>
  `${decimal(longitude, MAX_FRACTION_DIGITS)}, ${decimal(latitude, MAX_FRACTION_DIGITS)}`;

const hemisphere = (value: number, positive: string, negative: string) =>
  value < 0 ? negative : positive;

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

const withHemispheres =
  (angle: (value: number) => string) =>
  ({ latitude, longitude }: Coordinates) =>
    `${angle(latitude)}${hemisphere(latitude, "N", "S")}, ${angle(longitude)}${hemisphere(longitude, "E", "W")}`;

/** "50.4501°N, 30.5234°E" */
export const formatDD = withHemispheres(toDD);

/** "50° 27.006'N, 30° 31.404'E" */
export const formatDDM = withHemispheres(toDDM);

/** `50° 27' 0.36"N, 30° 31' 24.24"E` */
export const formatDMS = withHemispheres(toDMS);
