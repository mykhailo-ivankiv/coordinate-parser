import type { Coordinates } from "../parsers/commonParsers.ts";
import { toDeclaredPrecision } from "./precision.ts";
import type { Projected } from "./transverseMercator.ts";

// What a written coordinate actually designates. A latitude/longitude pair names a point, but a grid
// reference names a square: "36UUA2491" is every point of a 1 km square, and "36U 324182 5591608"
// every point within half a metre of that easting and northing. The centre is the single best
// estimate, the one that goes into storage; the corners say how far the truth can be from it.

export type Corners = {
  southWest: Coordinates;
  southEast: Coordinates;
  northEast: Coordinates;
  northWest: Coordinates;
};

export type Area = {
  centre: Coordinates;
  /** The square's corners in WGS 84, or null when the notation names a point. */
  corners: Corners | null;
  /** Side of the square in metres, 0 for a point. */
  size: number;
};

export const pointArea = (coords: Coordinates): Area => ({
  centre: toDeclaredPrecision(coords),
  corners: null,
  size: 0,
});

/**
 * A square of the projected grid, back in WGS 84. The corners are the grid's, so the sides follow
 * grid north rather than true north: away from the central meridian the square sits slightly
 * rotated against the lines of latitude and longitude, which is why all four corners are returned.
 */
export const gridSquare = (
  unproject: (location: Projected) => Coordinates,
  { easting, northing }: Projected,
  size: number,
): Area => {
  const at = (east: number, north: number) =>
    toDeclaredPrecision(unproject({ easting: easting + east, northing: northing + north }));

  return {
    centre: at(size / 2, size / 2),
    corners: {
      southWest: at(0, 0),
      southEast: at(size, 0),
      northEast: at(size, size),
      northWest: at(0, size),
    },
    size,
  };
};
