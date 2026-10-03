import type {
  Coordinates,
  GridLocation,
  MGRSCoordinate,
  USNGCoordinate,
} from "@coordinate-parser/parser";
import { MAX_DIGITS_PER_AXIS, ROW_LETTERS } from "./notation.ts";
import { type Area, gridSquare } from "./area.ts";
import { project } from "./transverseMercator.ts";
import {
  BAND_TOLERANCE,
  bandLimits,
  centralMeridianOf,
  projectToUTM,
  unprojectUTM,
  utmProjection,
} from "./UTMconverter.ts";

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
// Roughly, for latitude; only used to size the slack in the band check.
const METRES_PER_DEGREE = 111000;

const columnSet = (zone: number) => COLUMN_SETS[(zone - 1) % COLUMN_SETS.length];
const rowOffset = (zone: number) => (zone % 2 === 0 ? EVEN_ZONE_ROW_OFFSET : 0);

/** Size of the referenced square in metres, 1 to 100000. */
export type GridPrecision = 1 | 10 | 100 | 1000 | 10000 | 100000;

/**
 * WGS 84 to MGRS. A grid reference names the square a point falls in, so the position within the
 * square is truncated, never rounded: rounding up could name the neighbouring square.
 */
export const toMGRS = (coords: Coordinates, precision: GridPrecision = 1): MGRSCoordinate => {
  const { zone, band, easting, northing } = projectToUTM(coords);

  const column = Math.floor(easting / SQUARE);
  const row = Math.floor(northing / SQUARE) % ROW_LETTERS.length;
  const truncate = (metres: number) => Math.floor((metres % SQUARE) / precision) * precision;

  return {
    zone,
    band,
    square: `${columnSet(zone)[column - 1]}${ROW_LETTERS[(row + rowOffset(zone)) % ROW_LETTERS.length]}`,
    easting: truncate(easting),
    northing: truncate(northing),
    precision,
  };
};

/** WGS 84 to USNG: the MGRS grid, with at least one digit per axis. */
export const toUSNG = (coords: Coordinates, precision: Exclude<GridPrecision, 100000> = 1) =>
  toMGRS(coords, precision) as USNGCoordinate;

/**
 * The square an MGRS or USNG reference names, in WGS 84. The reference gives the square's
 * south-west corner — truncation, not rounding, put it there — and its precision gives the side.
 */
export const mgrsArea = ({
  zone,
  band,
  square,
  easting,
  northing,
  precision,
}: GridLocation & {
  zone: number;
  band: string;
  square: string;
}): Area => {
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

  // The band's southern edge is lowest on the central meridian, so a northing taken there is a
  // floor that every square in the band sits above. Step the row up by whole 2000 km cycles until
  // it clears that floor.
  const bandFloor =
    Math.floor(
      project(
        { latitude: bandSouth, longitude: centralMeridianOf(zone) },
        utmProjection(zone, hemisphere),
      ).northing / SQUARE,
    ) * SQUARE;
  let squareNorthing = row * SQUARE;
  while (squareNorthing < bandFloor) squareNorthing += ROW_CYCLE;

  const area = gridSquare(
    (location) => unprojectUTM(location, zone, hemisphere),
    { easting: column * SQUARE + easting, northing: squareNorthing + northing },
    precision,
  );

  // The row letter only recurs every 2000 km, so a band spanning less than that leaves some row
  // letters with no square inside it. Such a reference is malformed rather than merely imprecise.
  // A coarse square may hang over the band edge, so the check allows for the square's own size.
  const { latitude } = area.centre;
  const slack = precision / METRES_PER_DEGREE + BAND_TOLERANCE;
  if (latitude < bandSouth - slack || latitude > bandNorth + slack) {
    throw new RangeError(
      `MGRS square ${square} has no part in band ${band} of zone ${zone}, which spans ${bandSouth}° to ${bandNorth}°`,
    );
  }

  return area;
};

/**
 * MGRS or USNG to WGS 84. A reference names a square rather than a point, so this returns the
 * square's centre: the best single estimate, at most half a square from anywhere inside it.
 */
export const fromMGRS = (reference: Parameters<typeof mgrsArea>[0]): Coordinates =>
  mgrsArea(reference).centre;

const digitsOf = (metres: number, precision: number) => {
  const width = MAX_DIGITS_PER_AXIS - Math.log10(precision);
  return width === 0 ? "" : String(metres / precision).padStart(width, "0");
};

/** The compact form NGA.STND.0037 prints: "4QFJ1234567890". */
export const formatMGRS = ({ zone, band, square, easting, northing, precision }: MGRSCoordinate) =>
  `${zone}${band}${square}${digitsOf(easting, precision)}${digitsOf(northing, precision)}`;

/** The spaced form FGDC-STD-011-2001 prescribes: "10S GJ 06832 44683". */
export const formatUSNG = ({ zone, band, square, easting, northing, precision }: USNGCoordinate) =>
  `${zone}${band} ${square} ${digitsOf(easting, precision)} ${digitsOf(northing, precision)}`;
