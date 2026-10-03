import type { Coordinates } from "../parsers/commonParsers.ts";

// The reference surfaces and the datum shift the converters need. Every conversion in this library
// runs through WGS 84 latitude and longitude: that is the pivot the rest of the app stores.

export type Ellipsoid = {
  /** Semi-major (equatorial) axis, metres. */
  a: number;
  /** Flattening. */
  f: number;
};

// EPSG:7030 — https://epsg.io/7030
export const WGS84_ELLIPSOID: Ellipsoid = { a: 6378137, f: 1 / 298.257223563 };

// EPSG:7024, the ellipsoid of Ukraine 2000 (and of Pulkovo 1942) — https://epsg.io/7024
export const KRASSOWSKY_1940: Ellipsoid = { a: 6378245, f: 1 / 298.3 };

export type Cartesian = { x: number; y: number; z: number };

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** Geodetic latitude/longitude on `ellipsoid`, at zero ellipsoidal height, to earth-centred XYZ. */
export const toCartesian = (
  { latitude, longitude }: Coordinates,
  { a, f }: Ellipsoid,
): Cartesian => {
  const φ = toRadians(latitude);
  const λ = toRadians(longitude);
  const e2 = f * (2 - f);
  const ν = a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2);

  return {
    x: ν * Math.cos(φ) * Math.cos(λ),
    y: ν * Math.cos(φ) * Math.sin(λ),
    z: ν * (1 - e2) * Math.sin(φ),
  };
};

// Bowring's closed form, accurate to well under a millimetre at the earth's surface. The height it
// implies is dropped: none of the notations this library reads carries one.
export const toGeodetic = ({ x, y, z }: Cartesian, { a, f }: Ellipsoid): Coordinates => {
  const b = a * (1 - f);
  const e2 = f * (2 - f);
  const ε2 = e2 / (1 - e2);
  const p = Math.hypot(x, y);
  const R = Math.hypot(p, z);

  const β = Math.atan2(b * z * (1 + (ε2 * b) / R), a * p);
  const φ = Math.atan2(z + ε2 * b * Math.sin(β) ** 3, p - e2 * a * Math.cos(β) ** 3);

  return { latitude: toDegrees(φ), longitude: toDegrees(Math.atan2(y, x)) };
};

/** A geocentric translation, the three-parameter form of a Helmert transformation. */
export type DatumShift = { dx: number; dy: number; dz: number };

// EPSG:5840 "UCS-2000 to WGS 84 (2)", accuracy 1 m — https://epsg.io/5840
// It is the transformation PROJ picks by default between the two datums. The older seven-parameter
// EPSG:5590 "UCS-2000 to WGS 84 (1)" is registered at 5 m and is not used.
export const UCS2000_TO_WGS84: DatumShift = { dx: 24, dy: -121, dz: -76 };

const translate = (
  { x, y, z }: Cartesian,
  { dx, dy, dz }: DatumShift,
  sign: 1 | -1,
): Cartesian => ({
  x: x + sign * dx,
  y: y + sign * dy,
  z: z + sign * dz,
});

/** Moves a point from a local datum on `ellipsoid` onto WGS 84. */
export const localToWGS84 = (point: Coordinates, ellipsoid: Ellipsoid, shift: DatumShift) =>
  toGeodetic(translate(toCartesian(point, ellipsoid), shift, 1), WGS84_ELLIPSOID);

/** Moves a WGS 84 point onto a local datum on `ellipsoid`. */
export const wgs84ToLocal = (point: Coordinates, ellipsoid: Ellipsoid, shift: DatumShift) =>
  toGeodetic(translate(toCartesian(point, WGS84_ELLIPSOID), shift, -1), ellipsoid);
