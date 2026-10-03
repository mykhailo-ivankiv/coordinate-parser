import type { Coordinates } from "./coordinates.ts";
import { toDeclaredPrecision } from "./precision.ts";
import type { Projected } from "./transverseMercator.ts";

// What a written coordinate actually designates. A latitude/longitude pair names a point, but a grid
// reference names a square: "36UUA2491" is every point of a 1 km square, and "36U 324182 5591608"
// every point within half a metre of that easting and northing. The centre is the single best
// estimate, the one that goes into storage; the corners say how far the truth can be from it.

/** The four corners of a grid square, in WGS 84. */
export type Corners = {
  southWest: Coordinates;
  southEast: Coordinates;
  northEast: Coordinates;
  northWest: Coordinates;
};

/** What a written coordinate designates: a point, or a grid square around its centre. */
export type Area = {
  centre: Coordinates;
  /** The square's corners in WGS 84, or null when the notation names a point. */
  corners: Corners | null;
  /**
   * The square's boundary as a closed ring, south-west corner first and last, going east: the
   * corners, plus whatever points along the edges it takes to follow them as curves. Null for a point.
   */
  outline: Coordinates[] | null;
  /** Side of the square in metres, 0 for a point. */
  size: number;
};

export const pointArea = (coords: Coordinates): Area => ({
  centre: toDeclaredPrecision(coords),
  corners: null,
  outline: null,
  size: 0,
});

// An edge of a grid square is a straight line in the grid's own projection and a curve on a web map,
// which is drawn in Web Mercator: lines of constant northing bow away from the parallels, by about
// 240 m over a 100 km edge at Kyiv's latitude. A map joins consecutive points with straight
// segments, so an edge is split until every segment sits within this distance of the true edge.
// Below it a curve is indistinguishable from its chord: a 1 km square stays four corners.
const CURVE_TOLERANCE = 0.5; // metres on the ground
// Each level halves the segment and quarters its deviation, so this is far beyond what any square
// up to 100 km needs; it only guards against a degenerate input recursing without end.
const MAX_SPLITS = 10;

// The sphere Web Mercator is defined on, EPSG:3857.
const WEB_MERCATOR_RADIUS = 6378137;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const webMercator = ({ latitude, longitude }: Coordinates) => ({
  x: toRadians(longitude),
  y: Math.log(Math.tan(Math.PI / 4 + toRadians(latitude) / 2)),
});

/** How far `point` lies from the straight segment a web map would draw from `from` to `to`, in metres. */
const offChord = (from: Coordinates, to: Coordinates, point: Coordinates) => {
  const a = webMercator(from);
  const b = webMercator(to);
  const p = webMercator(point);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const across = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / length;
  // Web Mercator stretches distances by 1/cos(latitude); undo that to get ground metres.
  return across * WEB_MERCATOR_RADIUS * Math.cos(toRadians(point.latitude));
};

/**
 * The points along one edge after `from`, up to and including `to`. `along(t)` is the edge at
 * fraction t of its length; the edge is halved wherever its midpoint strays from the chord.
 */
const followEdge = (
  along: (t: number) => Coordinates,
  [start, end]: [number, number],
  from: Coordinates,
  to: Coordinates,
  splits = 0,
): Coordinates[] => {
  const middle = (start + end) / 2;
  const midpoint = along(middle);
  if (splits >= MAX_SPLITS || offChord(from, to, midpoint) < CURVE_TOLERANCE) return [to];

  return [
    ...followEdge(along, [start, middle], from, midpoint, splits + 1),
    ...followEdge(along, [middle, end], midpoint, to, splits + 1),
  ];
};

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

  const southWest = at(0, 0);
  const southEast = at(size, 0);
  const northEast = at(size, size);
  const northWest = at(0, size);

  // Walked anticlockwise from the south-west corner, each edge parametrised in grid metres.
  const edges: [(t: number) => Coordinates, Coordinates, Coordinates][] = [
    [(t) => at(t * size, 0), southWest, southEast],
    [(t) => at(size, t * size), southEast, northEast],
    [(t) => at((1 - t) * size, size), northEast, northWest],
    [(t) => at(0, (1 - t) * size), northWest, southWest],
  ];

  return {
    centre: at(size / 2, size / 2),
    corners: { southWest, southEast, northEast, northWest },
    outline: [
      southWest,
      ...edges.flatMap(([along, from, to]) => followEdge(along, [0, 1], from, to)),
    ],
    size,
  };
};
