import type { MGRSCoordinate, USNGCoordinate, WGS84Coordinate } from "@coordinate-parser/types";
import { ROW_LETTERS } from "./notation.ts";
import { squareCentre, gridSquare, toDeclaredPrecision } from "./area.ts";
import { type Projected, project } from "./transverseMercator.ts";
import {
  BAND_TOLERANCE,
  bandLimits,
  centralMeridianOf,
  projectToUTM,
  unprojectUTM,
  utmProjection,
} from "./utm.ts";

// WGS 84 latitude/longitude to and from MGRS, per NGA.STND.0037_2.0.0_GRIDS §3 —
// https://nsgreg.nga.mil/doc/view?i=4057. USNG uses the identical grid (FGDC-STD-011-2001), so the
// same arithmetic serves both; only the written form differs.
//
// The 100 km square letters are the UTM easting and northing in disguise:
//
//   * the column letter counts hundreds of kilometres east, from a set that cycles every three
//     zones — A-H in zones 1, 4, 7..., J-R in 2, 5, 8..., S-Z in 3, 6, 9...
//   * the row letter counts hundreds of kilometres north, modulo 2000 km, A-V with I and O skipped;
//     even zones start the cycle five letters in, at F, so that squares in neighbouring zones do
//     not share a name.
//
// The 2000 km cycle is what the latitude band is for: it picks which repetition of the row letter
// the reference means.

const COLUMN_SETS = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"];
const EVEN_ZONE_ROW_OFFSET = 5;
const SQUARE = 100000;
const ROW_CYCLE = SQUARE * ROW_LETTERS.length;
// Degrees from a zone's central meridian to its edge.
const ZONE_HALF_WIDTH = 3;
// Roughly, for latitude; only used to size the slack in the band check.
const METRES_PER_DEGREE = 111000;

const columnSet = (zone: number) => COLUMN_SETS[(zone - 1) % COLUMN_SETS.length];
const rowOffset = (zone: number) => (zone % 2 === 0 ? EVEN_ZONE_ROW_OFFSET : 0);

/**
 * A WGS 84 point as the MGRS reference of the square it falls in. The position within the square is
 * truncated, never rounded: rounding up could name the neighbouring square.
 *
 * @param point - The point, WGS 84 latitude and longitude.
 * @param precision - Side of the square to name, in metres; 1 unless given.
 * @returns The MGRS reference.
 * @throws RangeError outside 80°S-84°N, where MGRS gives way to the polar UPS grid.
 *
 * @example
 * ```ts
 * fromWgs84ToMgrs({ system: "WGS84", latitude: 50.4501, longitude: 30.5234 }, 1000)
 * // → { system: "MGRS", zone: 36, band: "U", square: "UA", easting: 24000, northing: 91000, precision: 1000 }
 * ```
 *
 * @group MGRS
 */
export const fromWgs84ToMgrs = (
  point: WGS84Coordinate,
  precision: 1 | 10 | 100 | 1000 | 10000 | 100000 = 1,
): MGRSCoordinate => {
  const { zone, band, easting, northing } = projectToUTM(toDeclaredPrecision(point));

  const column = Math.floor(easting / SQUARE);
  const row = Math.floor(northing / SQUARE) % ROW_LETTERS.length;
  const truncate = (metres: number) => Math.floor((metres % SQUARE) / precision) * precision;

  return {
    system: "MGRS",
    zone,
    band,
    square: `${columnSet(zone)[column - 1]}${ROW_LETTERS[(row + rowOffset(zone)) % ROW_LETTERS.length]}`,
    easting: truncate(easting),
    northing: truncate(northing),
    precision,
  };
};

/**
 * A WGS 84 point as the USNG reference of the square it falls in: the MGRS grid, with at least one
 * digit per axis, so 10 km is its coarsest square.
 *
 * @param point - The point, WGS 84 latitude and longitude.
 * @param precision - Side of the square to name, in metres; 1 unless given.
 * @returns The USNG reference.
 * @throws RangeError outside 80°S-84°N, and for a precision of 100000, which USNG cannot express.
 *
 * @example
 * ```ts
 * fromWgs84ToUsng({ system: "WGS84", latitude: 40.7128, longitude: -74.006 }, 10000)
 * // → { system: "USNG", zone: 18, band: "T", square: "WL", easting: 80000, northing: 0, precision: 10000 }
 * ```
 *
 * @group USNG
 */
export const fromWgs84ToUsng = (
  point: WGS84Coordinate,
  precision: 1 | 10 | 100 | 1000 | 10000 = 1,
): USNGCoordinate => {
  // The type rules it out; this is for callers the type does not reach.
  if ((precision as number) === 100000) {
    throw new RangeError(
      "USNG requires at least one digit per axis, so its coarsest square is 10 km",
    );
  }
  return { ...fromWgs84ToMgrs(point, precision), system: "USNG" };
};

/**
 * The grid square an MGRS or USNG reference names: its zone's unprojection, its south-west corner in
 * UTM metres — truncation, not rounding, put it there — its side, and its centre in WGS 84.
 */
const mgrsSquare = ({ zone, band, square, easting, northing, precision }: MGRSCoordinate) => {
  const [columnLetter, rowLetter] = square;

  const column = columnSet(zone).indexOf(columnLetter) + 1;
  if (column === 0) {
    throw new RangeError(
      `MGRS column letter ${columnLetter} is not used in zone ${zone}, whose columns are ${columnSet(zone)}`,
    );
  }

  const row =
    (ROW_LETTERS.indexOf(rowLetter) - rowOffset(zone) + ROW_LETTERS.length) % ROW_LETTERS.length;

  const [bandSouth, bandNorth] = bandLimits(band);
  const hemisphere = bandSouth < 0 ? "S" : "N";

  // The lowest northing of the band's southern edge is a floor that every square in the band sits
  // above. North of the equator the parallels bow towards the pole, so the edge is lowest on the
  // central meridian; south of it they bow the other way, and it is lowest at the zone's edges.
  // Step the row up by whole 2000 km cycles until it clears that floor.
  const edgeNorthing = (offset: number) =>
    project(
      { latitude: bandSouth, longitude: centralMeridianOf(zone) + offset },
      utmProjection(zone, hemisphere),
    ).northing;
  const bandFloor =
    Math.floor(Math.min(edgeNorthing(0), edgeNorthing(ZONE_HALF_WIDTH)) / SQUARE) * SQUARE;
  let squareNorthing = row * SQUARE;
  while (squareNorthing < bandFloor) squareNorthing += ROW_CYCLE;

  const fromGrid = (location: Projected) => unprojectUTM(location, zone, hemisphere);
  const southWest = { easting: column * SQUARE + easting, northing: squareNorthing + northing };
  const centre = squareCentre(fromGrid, southWest, precision);

  // The row letter only recurs every 2000 km, so a band spanning less than that leaves some row
  // letters with no square inside it. Such a reference is malformed rather than merely imprecise.
  // A coarse square may hang over the band edge, so the check allows for the square's own size.
  const { latitude } = centre;
  const slack = precision / METRES_PER_DEGREE + BAND_TOLERANCE;
  if (latitude < bandSouth - slack || latitude > bandNorth + slack) {
    throw new RangeError(
      `MGRS square ${square} has no part in band ${band} of zone ${zone}, which spans ${bandSouth}° to ${bandNorth}°`,
    );
  }

  return { fromGrid, southWest, size: precision, centre };
};

/**
 * An MGRS reference as a WGS 84 point. A reference names a square rather than a point, so this is
 * the square's centre: the best single estimate, at most half a square from anywhere inside it.
 *
 * @param reference - The MGRS reference.
 * @returns The centre of the square, WGS 84 latitude and longitude.
 * @throws RangeError for a reference no place matches: a column letter not used in its zone, or a
 * square with no part in its latitude band.
 *
 * @example
 * ```ts
 * fromMgrsToWgs84(mgrsParser.run("36UUA2491").result[0])
 * // → { system: "WGS84", latitude: 50.4492283, longitude: 30.5279224 }
 * ```
 *
 * @group MGRS
 */
export const fromMgrsToWgs84 = (reference: MGRSCoordinate): WGS84Coordinate =>
  mgrsSquare(reference).centre;

/**
 * A USNG reference as a WGS 84 point: the centre of the square it names, as for MGRS.
 *
 * @param reference - The USNG reference.
 * @returns The centre of the square, WGS 84 latitude and longitude.
 * @throws RangeError where fromMgrsToWgs84 does.
 *
 * @example
 * ```ts
 * fromUsngToWgs84(usngParser.run("18T WL 83959 07350").result[0])
 * // → { system: "WGS84", latitude: 40.7127955, longitude: -74.0059986 }
 * ```
 *
 * @group USNG
 */
export const fromUsngToWgs84 = (reference: USNGCoordinate): WGS84Coordinate =>
  mgrsSquare(reference).centre;

/**
 * The square an MGRS reference names, in WGS 84: its centre and corners. The sides follow the UTM grid, so
 * away from the zone's central meridian the square sits slightly rotated against the lines of
 * latitude and longitude.
 *
 * @param reference - The MGRS reference.
 * @returns The centre and the four corners, WGS 84 latitude and longitude.
 * @throws RangeError where fromMgrsToWgs84 does.
 *
 * @example
 * ```ts
 * fromMgrsToWgs84Square(mgrsParser.run("36UUA2491").result[0]).southWest
 * // → { system: "WGS84", latitude: 50.4445861, longitude: 30.5211213 }
 * ```
 *
 * @group MGRS
 */
export const fromMgrsToWgs84Square = (
  reference: MGRSCoordinate,
): {
  centre: WGS84Coordinate;
  southWest: WGS84Coordinate;
  southEast: WGS84Coordinate;
  northEast: WGS84Coordinate;
  northWest: WGS84Coordinate;
} => {
  const { fromGrid, southWest, size } = mgrsSquare(reference);
  return gridSquare(fromGrid, southWest, size);
};

/**
 * The square a USNG reference names, in WGS 84: its centre and corners, as for MGRS.
 *
 * @param reference - The USNG reference.
 * @returns The centre and the four corners, WGS 84 latitude and longitude.
 * @throws RangeError where fromMgrsToWgs84 does.
 *
 * @example
 * ```ts
 * fromUsngToWgs84Square(usngParser.run("36U UA 24 91").result[0]).northEast
 * // → { system: "WGS84", latitude: 50.4538701, longitude: 30.5347249 }
 * ```
 *
 * @group USNG
 */
export const fromUsngToWgs84Square = (
  reference: USNGCoordinate,
): {
  centre: WGS84Coordinate;
  southWest: WGS84Coordinate;
  southEast: WGS84Coordinate;
  northEast: WGS84Coordinate;
  northWest: WGS84Coordinate;
} => {
  const { fromGrid, southWest, size } = mgrsSquare(reference);
  return gridSquare(fromGrid, southWest, size);
};
