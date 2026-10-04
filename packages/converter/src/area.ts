import type { WGS84Coordinate } from "@coordinate-parser/types";
import type { Coordinates } from "./coordinates.ts";
import { MAX_FRACTION_DIGITS } from "./notation.ts";
import type { Projected } from "./transverseMercator.ts";

// A grid reference names a square, not a point: "36UUA2491" is every point of a 1 km square, and
// "36U 324182 5591608" every point within half a metre of that easting and northing. Its centre is
// the single best estimate, the one that goes into storage; its corners say how far the truth can
// be from it.

// Latitude and longitude leave the converters at the precision the parsers accept: seven decimal
// places, about a centimetre. Anything finer is floating point residue of the projection maths, and
// trimming it keeps a value written to the database identical to the same value typed in by hand.
const scale = 10 ** MAX_FRACTION_DIGITS;

/**
 * Rounds latitude and longitude to the seven decimal places the parsers accept.
 *
 * @param coords - The point to round, latitude and longitude in WGS 84.
 * @returns The point at about a centimetre.
 */
export const toDeclaredPrecision = (coords: {
  latitude: number;
  longitude: number;
}): WGS84Coordinate => ({
  system: "WGS84",
  // `+ 0` folds a negative zero into a plain one, so the equator does not print as "-0".
  latitude: Math.round(coords.latitude * scale) / scale + 0,
  longitude: Math.round(coords.longitude * scale) / scale + 0,
});

// A square of the projected grid, back in WGS 84: `southWest` is its corner in grid metres, `size`
// its side. The corners are the grid's, so the sides follow grid north rather than true north: away
// from the central meridian the square sits slightly rotated against the lines of latitude and
// longitude, which is why all four corners are given beside the centre.

export const squareCentre = (
  unproject: (location: Projected) => Coordinates,
  southWest: Projected,
  size: number,
): WGS84Coordinate =>
  toDeclaredPrecision(
    unproject({ easting: southWest.easting + size / 2, northing: southWest.northing + size / 2 }),
  );

export const gridSquare = (
  unproject: (location: Projected) => Coordinates,
  { easting, northing }: Projected,
  size: number,
): {
  centre: WGS84Coordinate;
  southWest: WGS84Coordinate;
  southEast: WGS84Coordinate;
  northEast: WGS84Coordinate;
  northWest: WGS84Coordinate;
} => {
  const at = (east: number, north: number) =>
    toDeclaredPrecision(unproject({ easting: easting + east, northing: northing + north }));
  return {
    centre: at(size / 2, size / 2),
    southWest: at(0, 0),
    southEast: at(size, 0),
    northEast: at(size, size),
    northWest: at(0, size),
  };
};
