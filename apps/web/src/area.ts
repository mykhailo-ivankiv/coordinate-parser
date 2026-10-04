import {
  fromMgrsToWgs84Square,
  fromUcs2000ToWgs84Square,
  fromUsngToWgs84Square,
  fromUtmToWgs84Square,
  fromWgs84ToMgrs,
  fromWgs84ToUcs2000,
  fromWgs84ToUsng,
  fromWgs84ToUtm,
} from "@coordinate-parser/converter";
import type {
  Coordinate,
  CoordinateSystem,
  MGRSCoordinate,
  WGS84Coordinate,
} from "@coordinate-parser/types";
import { LATITUDE_BANDS } from "./gridOverlay.ts";

// What a written coordinate designates, for the converter page and its map. A latitude/longitude
// pair names a point; a grid reference names a square, whose centre is what gets stored and whose
// corners say how far the truth can be from it. The geodesy is the converter's; drawing the square
// on a web map and listing the squares of another grid it reaches are the page's.

/** What a written coordinate designates: a point, or a grid square around its centre. */
export type Area = {
  centre: WGS84Coordinate;
  /** The square's corners in WGS 84; null when the coordinate names a point. */
  southWest: WGS84Coordinate | null;
  southEast: WGS84Coordinate | null;
  northEast: WGS84Coordinate | null;
  northWest: WGS84Coordinate | null;
  /**
   * The square's boundary as a closed ring, south-west corner first and last, going east: the
   * corners, plus whatever points along the edges it takes to follow them as curves. Null for a point.
   */
  outline: WGS84Coordinate[] | null;
  /** Side of the square in metres, 0 for a point. */
  size: number;
};

// A WGS 84 point in `system`, or the reason the system cannot express it: UTM, MGRS and USNG stop
// short of the poles, UCS-2000 at its zones, and USNG has no 100 km squares.
export const inSystem = (
  point: WGS84Coordinate,
  system: CoordinateSystem,
  precision: 1 | 10 | 100 | 1000 | 10000 | 100000 = 1,
): Coordinate | { system: CoordinateSystem; error: string } => {
  try {
    switch (system) {
      case "WGS84":
        return point;
      case "MGRS":
        return fromWgs84ToMgrs(point, precision);
      case "USNG":
        // A precision of 100000 gets past the type here and is refused with a RangeError instead.
        return fromWgs84ToUsng(point, precision as 1 | 10 | 100 | 1000 | 10000);
      case "UTM":
        return fromWgs84ToUtm(point);
      case "UCS-2000":
        return fromWgs84ToUcs2000(point);
    }
  } catch (error) {
    if (error instanceof RangeError) return { system, error: error.message };
    throw error;
  }
};

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

const webMercator = ({ latitude, longitude }: WGS84Coordinate) => ({
  x: toRadians(longitude),
  y: Math.log(Math.tan(Math.PI / 4 + toRadians(latitude) / 2)),
});

/** How far `point` lies from the straight segment a web map would draw from `from` to `to`, in metres. */
const offChord = (from: WGS84Coordinate, to: WGS84Coordinate, point: WGS84Coordinate) => {
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
  along: (t: number) => WGS84Coordinate | null,
  [start, end]: [number, number],
  from: WGS84Coordinate,
  to: WGS84Coordinate,
  splits = 0,
): WGS84Coordinate[] => {
  const middle = (start + end) / 2;
  const midpoint = along(middle);
  if (midpoint === null || splits >= MAX_SPLITS || offChord(from, to, midpoint) < CURVE_TOLERANCE)
    return [to];

  return [
    ...followEdge(along, [start, middle], from, midpoint, splits + 1),
    ...followEdge(along, [middle, end], midpoint, to, splits + 1),
  ];
};

/**
 * The point `east` and `north` whole metres from the south-west corner of an MGRS or USNG square:
 * a corner of the metre square there, so it lies exactly on the grid. Where the square hangs over
 * its latitude band, the point can be in the next band, so that is tried too.
 */
const pointInSquare = (
  { zone, band, square, easting, northing, precision }: MGRSCoordinate,
  east: number,
  north: number,
): WGS84Coordinate | null => {
  const index = LATITUDE_BANDS.indexOf(band);
  for (const nearby of [band, LATITUDE_BANDS[index + 1], LATITUDE_BANDS[index - 1]]) {
    if (nearby === undefined) continue;
    try {
      const metreSquare = fromMgrsToWgs84Square({
        system: "MGRS",
        zone,
        band: nearby,
        square,
        easting: easting + Math.min(east, precision - 1),
        northing: northing + Math.min(north, precision - 1),
        precision: 1,
      });
      if (east === precision)
        return north === precision ? metreSquare.northEast : metreSquare.southEast;
      return north === precision ? metreSquare.northWest : metreSquare.southWest;
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
    }
  }
  return null;
};

/**
 * The area a coordinate designates, in WGS 84: a point for WGS 84 latitude and longitude, a square
 * for the grid references.
 *
 * @throws RangeError on a reference the parser accepts but no place matches: an MGRS column letter
 * not used in its zone, or a band that contradicts the northing.
 */
export const areaOf = (coordinate: Coordinate): Area => {
  switch (coordinate.system) {
    case "WGS84":
      return {
        centre: coordinate,
        southWest: null,
        southEast: null,
        northEast: null,
        northWest: null,
        outline: null,
        size: 0,
      };
    case "MGRS":
    case "USNG": {
      const square =
        coordinate.system === "MGRS"
          ? fromMgrsToWgs84Square(coordinate)
          : fromUsngToWgs84Square(coordinate);
      const { southWest, southEast, northEast, northWest } = square;
      const size = coordinate.precision;
      const at = (east: number, north: number) =>
        pointInSquare(coordinate, Math.round(east), Math.round(north));
      // Walked anticlockwise from the south-west corner, each edge parametrised in grid metres.
      const edges: [(t: number) => WGS84Coordinate | null, WGS84Coordinate, WGS84Coordinate][] = [
        [(t) => at(t * size, 0), southWest, southEast],
        [(t) => at(size, t * size), southEast, northEast],
        [(t) => at((1 - t) * size, size), northEast, northWest],
        [(t) => at(0, (1 - t) * size), northWest, southWest],
      ];
      return {
        ...square,
        outline: [
          southWest,
          ...edges.flatMap(([along, from, to]) => followEdge(along, [0, 1], from, to)),
        ],
        size,
      };
    }
    case "UTM":
    case "UCS-2000": {
      // A metre square: its edges are as straight as a map can draw.
      const square =
        coordinate.system === "UTM"
          ? fromUtmToWgs84Square(coordinate)
          : fromUcs2000ToWgs84Square(coordinate);
      const { southWest, southEast, northEast, northWest } = square;
      return {
        ...square,
        outline: [southWest, southEast, northEast, northWest, southWest],
        size: 1,
      };
    }
  }
};

// A grid reference names a square, so converting one into another grid is not a point-to-point
// operation. The input square can be larger than the target's squares — a 1 km MGRS square holds a
// hundred 100 m ones — or straddle the edge between two of them, as a 1 m UTM square shifted onto the
// UCS-2000 datum usually does. Converting just the centre picks one target square and hides the
// rest; coveringSquares finds every target square the input reaches.
//
// Which square a point lies in is the converter's to say exactly, so the test is done with points:
// two squares overlap when a point of either's outline, moved a hair inwards, lies in the other.
// For squares that is enough — one cannot cross another without a corner of one inside the other.

/** Enumerating more squares than this is a list nobody reads; a coarser precision is the answer. */
const MAX_COVERING_SQUARES = 100;

// Corners are rounded to seven decimal places, about a centimetre, so a corner two squares share can
// land a hair inside either. Moving every outline point this far towards its own square's centre
// keeps squares that merely touch from counting as overlapping.
const EDGE_TOLERANCE = 0.02; // metres

// Metres per degree, near enough over the size of a square.
const METRES_PER_DEGREE = 111320;

const inwards = (point: WGS84Coordinate, centre: WGS84Coordinate): WGS84Coordinate => {
  const scale = Math.cos(toRadians(centre.latitude));
  const east = (centre.longitude - point.longitude) * scale * METRES_PER_DEGREE;
  const north = (centre.latitude - point.latitude) * METRES_PER_DEGREE;
  const fraction = EDGE_TOLERANCE / Math.hypot(east, north);
  return {
    system: "WGS84",
    latitude: point.latitude + (centre.latitude - point.latitude) * fraction,
    longitude: point.longitude + (centre.longitude - point.longitude) * fraction,
  };
};

/** The outline of a square, each point moved a hair towards its centre. */
const insetOutline = ({ outline, centre }: Area) =>
  (outline ?? []).map((point) => inwards(point, centre));

const metresBetween = (a: WGS84Coordinate, b: WGS84Coordinate) =>
  Math.hypot(
    (b.longitude - a.longitude) * Math.cos(toRadians(a.latitude)) * METRES_PER_DEGREE,
    (b.latitude - a.latitude) * METRES_PER_DEGREE,
  );

/**
 * The centres of the eight squares around one, extrapolated from its corners: near enough to the
 * true centres that converting them names the neighbours, across a zone edge too.
 */
const aroundCentres = ({ centre, southWest, southEast, northEast, northWest }: Area) => {
  if (southWest === null || southEast === null || northEast === null || northWest === null)
    return [];
  const east = {
    latitude:
      (southEast.latitude + northEast.latitude - southWest.latitude - northWest.latitude) / 2,
    longitude:
      (southEast.longitude + northEast.longitude - southWest.longitude - northWest.longitude) / 2,
  };
  const north = {
    latitude:
      (northWest.latitude + northEast.latitude - southWest.latitude - southEast.latitude) / 2,
    longitude:
      (northWest.longitude + northEast.longitude - southWest.longitude - southEast.longitude) / 2,
  };
  return [-1, 0, 1].flatMap((i) =>
    [-1, 0, 1]
      .filter((j) => i !== 0 || j !== 0)
      .map((j): WGS84Coordinate => ({
        system: "WGS84",
        latitude: centre.latitude + i * east.latitude + j * north.latitude,
        longitude: centre.longitude + i * east.longitude + j * north.longitude,
      })),
  );
};

/**
 * Every square of `system` that the `input` coordinate reaches, the one containing its centre first;
 * or, past 100, only roughly how many there are, the limit, and the centre's square.
 *
 * @throws RangeError where the system cannot express the input's centre.
 */
export const coveringSquares = (
  input: Coordinate,
  system: CoordinateSystem,
  precision: 1 | 10 | 100 | 1000 | 10000 | 100000 = 1,
):
  | { kind: "squares"; squares: Coordinate[] }
  | { kind: "tooMany"; count: number; limit: number; primary: Coordinate } => {
  const area = areaOf(input);
  const encode = (point: WGS84Coordinate) => {
    const result = inSystem(point, system, precision);
    return "error" in result ? null : result;
  };
  const primary = inSystem(area.centre, system, precision);
  if ("error" in primary) throw new RangeError(primary.error);
  if (system === "WGS84" || area.southWest === null || area.southEast === null) {
    return { kind: "squares", squares: [primary] };
  }

  // How many target squares the input's extent spans, from its sides.
  const side = system === "MGRS" || system === "USNG" ? precision : 1;
  const across = (from: WGS84Coordinate, to: WGS84Coordinate | null) =>
    to === null ? 1 : Math.max(1, Math.round(metresBetween(from, to) / side));
  const count = across(area.southWest, area.southEast) * across(area.southWest, area.northWest);
  if (count > MAX_COVERING_SQUARES) {
    return { kind: "tooMany", count, limit: MAX_COVERING_SQUARES, primary };
  }

  // Whether a point lies in the input square: it converts back to the same reference.
  const inputPrecision = input.system === "MGRS" || input.system === "USNG" ? input.precision : 1;
  const key = (coordinate: Coordinate | { error: string } | null) => JSON.stringify(coordinate);
  const inputKey = key(inSystem(area.centre, input.system, inputPrecision));
  const insideInput = (point: WGS84Coordinate) =>
    key(inSystem(point, input.system, inputPrecision)) === inputKey;

  // The target squares holding a point of the input's outline.
  const holdingInput = new Set(insetOutline(area).map((point) => key(encode(point))));

  // From the centre's square outwards, as long as squares keep overlapping the input.
  const found = new Map<string, Coordinate>([[key(primary), primary]]);
  const seen = new Set([key(primary)]);
  const queue: Coordinate[] = [primary];
  // The estimate above keeps this to about a hundred squares; the walk runs to the end, so that
  // a count just past the limit is the true one.
  while (queue.length > 0) {
    const square = queue.shift();
    if (square === undefined) break;
    for (const centre of aroundCentres(areaOf(square))) {
      const next = encode(centre);
      // A square the system cannot express — off the edge of Ukraine for UCS-2000 — is not one the
      // input can be in.
      if (next === null || seen.has(key(next))) continue;
      seen.add(key(next));
      if (holdingInput.has(key(next)) || insetOutline(areaOf(next)).some(insideInput)) {
        found.set(key(next), next);
        queue.push(next);
      }
    }
  }

  if (found.size > MAX_COVERING_SQUARES) {
    return { kind: "tooMany", count: found.size, limit: MAX_COVERING_SQUARES, primary };
  }
  return { kind: "squares", squares: [...found.values()] };
};
