import type { Area } from "./area.ts";
import type { CoordinateSystem } from "@coordinate-parser/parser";
import { type ConversionOptions, type Converted, fromWGS84 } from "./coordinateConverter.ts";
import type { Box } from "./gridOverlay.ts";
import type { Projected } from "./transverseMercator.ts";
import { ucs2000Grid, ucs2000ZoneOf } from "./UCS2000converter.ts";
import { projectToUTM, utmGrid } from "./UTMconverter.ts";

// A grid reference names a square, so converting one into another grid is not a point-to-point
// operation. The input square can be larger than the target's squares — a 1 km MGRS square holds a
// hundred 100 m ones — or straddle the edge between two of them, as a 1 m UTM square shifted onto the
// UCS-2000 datum usually does. Converting just the centre picks one target square and hides the
// rest; this finds every target square the input area reaches.
//
// The test runs in the target grid's own coordinates, where its squares are axis-aligned and the
// input's outline (already densified along curved edges, see area.ts) is a plain polygon.

/** Enumerating more squares than this is a list nobody reads; a coarser precision is the answer. */
const MAX_COVERING_SQUARES = 100;

// The input outline is rounded to seven decimal places, about a centimetre, so an edge the input
// shares exactly with a target square can land a hair inside it. Shrinking each target square by
// more than that keeps squares that merely touch the input from counting as overlapping it.
const EDGE_TOLERANCE = 0.02; // metres

/** What coveringSquares finds: the squares themselves, or how many there would be. */
export type Coverage =
  /** Every target square the input reaches, the one containing the input's centre first. */
  | { kind: "squares"; squares: Converted[] }
  /**
   * Too many to list: how many grid cells the input's extent spans, the most that would have been
   * listed, and the centre's square.
   */
  | { kind: "tooMany"; count: number; limit: number; primary: Converted };

type TargetGrid = {
  project: (coords: { latitude: number; longitude: number }) => Projected;
  unproject: (location: Projected) => { latitude: number; longitude: number };
  /** Side of a square in metres. */
  size: number;
  /**
   * Where squares start relative to multiples of `size`. MGRS squares begin on a multiple, since
   * references truncate; UTM and UCS-2000 squares are centred on one, since references round.
   */
  shift: number;
};

const targetGrid = (
  centre: { latitude: number; longitude: number },
  system: CoordinateSystem,
  precision: number,
): TargetGrid | null => {
  switch (system) {
    case "MGRS":
    case "USNG": {
      const { zone, hemisphere } = projectToUTM(centre);
      return { ...utmGrid(zone, hemisphere), size: precision, shift: 0 };
    }
    case "UTM": {
      const { zone, hemisphere } = projectToUTM(centre);
      return { ...utmGrid(zone, hemisphere), size: 1, shift: 0.5 };
    }
    case "UCS-2000":
      return { ...ucs2000Grid(ucs2000ZoneOf(centre)), size: 1, shift: 0.5 };
    default:
      // The latitude/longitude notations name points, so there is no square to land in.
      return null;
  }
};

const insideBox = ({ easting, northing }: Projected, box: Box) =>
  easting > box.west && easting < box.east && northing > box.south && northing < box.north;

// Ray casting: count the polygon edges a ray running east from the point crosses.
const insidePolygon = ({ easting, northing }: Projected, ring: Projected[]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.northing > northing !== b.northing > northing &&
      easting <
        ((b.easting - a.easting) * (northing - a.northing)) / (b.northing - a.northing) + a.easting
    ) {
      inside = !inside;
    }
  }
  return inside;
};

const turn = (a: Projected, b: Projected, c: Projected) =>
  Math.sign(
    (b.easting - a.easting) * (c.northing - a.northing) -
      (b.northing - a.northing) * (c.easting - a.easting),
  );

const segmentsCross = (a: Projected, b: Projected, c: Projected, d: Projected) =>
  turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;

const overlaps = (ring: Projected[], box: Box) => {
  const corners: Projected[] = [
    { easting: box.west, northing: box.south },
    { easting: box.east, northing: box.south },
    { easting: box.east, northing: box.north },
    { easting: box.west, northing: box.north },
  ];

  if (ring.some((vertex) => insideBox(vertex, box))) return true;
  if (corners.some((corner) => insidePolygon(corner, ring))) return true;

  // Neither holds a vertex of the other, but they can still cross like a plus sign.
  return ring.some((start, index) => {
    const end = ring[(index + 1) % ring.length];
    return corners.some((corner, k) => segmentsCross(start, end, corner, corners[(k + 1) % 4]));
  });
};

/**
 * Every square of `system` that the input `area` reaches.
 *
 * @param area - The input, as areaOf gives it.
 * @param system - The grid to cover it with.
 * @param options - The MGRS or USNG precision; 1 m unless given.
 * @returns The squares, or only their count when there are more than 100.
 * @throws RangeError where fromWGS84 would: where the system cannot express the input's centre.
 */
export const coveringSquares = (
  area: Area,
  system: CoordinateSystem,
  options: ConversionOptions = {},
): Coverage => {
  const primary = fromWGS84(area.centre, system, options);
  const grid = targetGrid(area.centre, system, options.precision ?? 1);
  if (grid === null || area.outline === null) return { kind: "squares", squares: [primary] };

  const { size, shift } = grid;
  const ring = area.outline.map(grid.project);

  // Square k spans [k·size − shift, (k+1)·size − shift).
  const first = (value: number) => Math.floor((value + shift) / size);
  const span = (values: number[]) => [
    first(Math.min(...values) + EDGE_TOLERANCE),
    first(Math.max(...values) - EDGE_TOLERANCE),
  ];
  const columns = span(ring.map(({ easting }) => easting));
  const rows = span(ring.map(({ northing }) => northing));
  const count = (columns[1] - columns[0] + 1) * (rows[1] - rows[0] + 1);
  if (count > MAX_COVERING_SQUARES) {
    return { kind: "tooMany", count, limit: MAX_COVERING_SQUARES, primary };
  }

  const found = new Map<string, Converted>([[primary.value, primary]]);
  for (let column = columns[0]; column <= columns[1]; column++) {
    for (let row = rows[0]; row <= rows[1]; row++) {
      const west = column * size - shift;
      const south = row * size - shift;
      const box = {
        west: west + EDGE_TOLERANCE,
        south: south + EDGE_TOLERANCE,
        east: west + size - EDGE_TOLERANCE,
        north: south + size - EDGE_TOLERANCE,
      };
      if (!overlaps(ring, box)) continue;

      // Re-encoded from its centre, so the square gets its proper reference and area even where it
      // lies across a zone edge and fromWGS84 files it under the neighbouring zone.
      const centre = grid.unproject({ easting: west + size / 2, northing: south + size / 2 });
      try {
        const square = fromWGS84(centre, system, options);
        if (!found.has(square.value)) found.set(square.value, square);
      } catch (error) {
        // A square the system cannot express — off the edge of Ukraine for UCS-2000 — is not one
        // the point can be in.
        if (!(error instanceof RangeError)) throw error;
      }
    }
  }

  return { kind: "squares", squares: [...found.values()] };
};
