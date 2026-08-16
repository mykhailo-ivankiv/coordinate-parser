import {
  digits,
  fail,
  type Parser,
  possibly,
  sequenceOf,
  succeedWith,
  takeRight,
  whitespace,
} from "arcsecond";
import { commaOrWhitespace, letterFrom } from "./commonParsers.ts";

// Grammar shared by the grid reference systems. MGRS defines the grid (NGA.STND.0037) and USNG
// adopts it wholesale (FGDC-STD-011-2001), so the letter sets, the zone number and the numeric
// location are one grammar with a couple of parameters rather than two near-copies. UTM, the
// projection all three sit on, shares the zone number and the band letters from here too.

export { letterFrom };

export const LATITUDE_BANDS = "CDEFGHJKLMNPQRSTUVWX";
export const COLUMN_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ROW_LETTERS = "ABCDEFGHJKLMNPQRSTUV";

export const MAX_DIGITS_PER_AXIS = 5;

export type GridLocation = {
  /** Metres east of the south-west corner of the 100 km square. */
  easting: number;
  /** Metres north of the south-west corner of the 100 km square. */
  northing: number;
  /** Size of the referenced square in metres: 100000 down to 1. */
  precision: number;
};

// A letter always follows the zone number, so greedy digits cannot overrun into it.
export const zoneNumber = (system: string, note = "") =>
  digits
    .errorMap(
      ({ index }) => `ParseError (position ${index}): Expecting a UTM zone number 1-60${note}`,
    )
    .chain((text?: string): Parser<number> => {
      const value = Number(text);
      return text !== undefined && text.length <= 2 && value >= 1 && value <= 60
        ? succeedWith(value)
        : fail(`${system} zone must be between 1 and 60, but got "${text}"`);
    });

// Each axis carries the same digit count, and dropping digits coarsens the reference rather
// than moving it: "16" is the 10 km square at 10000E 60000N, not the point 1E 6N.
//
// `minDigitsPerAxis` is the one place the two systems disagree: MGRS lets a reference name a bare
// 100 km square, USNG requires at least one digit per axis and so bottoms out at 10 km.
export const numericLocation = (system: string, minDigitsPerAxis: number) => {
  const locationOf = (easting: string, northing: string): Parser<GridLocation> => {
    if (easting.length !== northing.length) {
      return fail(
        `${system} easting and northing must carry the same number of digits, but got ${easting.length} and ${northing.length}`,
      );
    }

    if (easting.length > MAX_DIGITS_PER_AXIS) {
      return fail(
        `${system} allows at most ${MAX_DIGITS_PER_AXIS} digits per axis, but got ${easting.length}`,
      );
    }

    if (easting.length < minDigitsPerAxis) {
      return fail(
        `${system} requires at least ${minDigitsPerAxis} digit per axis, but got ${easting.length}`,
      );
    }

    const precision = 10 ** (MAX_DIGITS_PER_AXIS - easting.length);
    return succeedWith({
      easting: Number(easting || "0") * precision,
      northing: Number(northing || "0") * precision,
      precision,
    });
  };

  // Captured as raw syntax first, so that a malformed digit run reports its own problem
  // instead of being silently discarded by `possibly` and blamed on the end of the input.
  return possibly(
    sequenceOf([digits, possibly(takeRight<string, string>(whitespace)(digits))]),
  ).chain((captured?: [string, string | null] | null): Parser<GridLocation> => {
    if (captured === undefined || captured === null) return locationOf("", "");

    const [first, second] = captured;
    if (second !== null) return locationOf(first, second);

    if (first.length % 2 !== 0) {
      return fail(`${system} location must have an even number of digits, but got ${first.length}`);
    }

    const half = first.length / 2;
    return locationOf(first.slice(0, half), first.slice(half));
  });
};

// UTM names a point by metres east and north within a zone, rather than by an offset inside a
// lettered square. Easting is measured from a false origin 500000 m west of the central meridian,
// so it is always six digits; the geometrically reachable span is roughly 166000-834000, but map
// sheets extend zones past their nominal edges, so only the digit shape is enforced here.
// Northing runs from 0 at the equator northwards, and from 10000000 at the equator southwards, so
// a northern point near the equator legitimately has fewer than seven digits.
export const EASTING_DIGITS = 6;
export const NORTHING_DIGITS = 7;
const MIN_EASTING = 100000;
const MAX_EASTING = 999999;
const MAX_NORTHING = 10000000;

export type UTMLocation = {
  /** Metres east of the zone's false origin; 500000 sits on the central meridian. */
  easting: number;
  /** Metres north of the equator, or south of 10000000 for southern-hemisphere references. */
  northing: number;
};

export const utmLocation = (system: string) => {
  const build = (easting: string, northing: string): Parser<UTMLocation> => {
    if (easting.length !== EASTING_DIGITS) {
      return fail(
        `${system} easting must have ${EASTING_DIGITS} digits, but got ${easting.length}`,
      );
    }

    // One digit wider than the concatenated form allows, because 10000000 — the southern false
    // northing, sitting on the equator — is the single legitimate eight-digit value. The numeric
    // bound below is what actually rules; this only stops an unbounded run of digits.
    if (northing.length > NORTHING_DIGITS + 1) {
      return fail(
        `${system} northing may not exceed ${NORTHING_DIGITS + 1} digits, but got ${northing.length}`,
      );
    }

    const east = Number(easting);
    const north = Number(northing);
    if (east < MIN_EASTING || east > MAX_EASTING) {
      return fail(
        `${system} easting must be between ${MIN_EASTING} and ${MAX_EASTING} metres, but got ${east}`,
      );
    }

    if (north > MAX_NORTHING) {
      return fail(
        `${system} northing must be between 0 and ${MAX_NORTHING} metres, but got ${north}`,
      );
    }

    return succeedWith({ easting: east, northing: north });
  };

  return sequenceOf([
    digits,
    possibly(sequenceOf([commaOrWhitespace, digits]).map(([, second]) => second)),
  ]).chain((captured?: [string, string | null]): Parser<UTMLocation> => {
    if (captured === undefined) return fail(`Expecting a ${system} easting and northing`);

    const [first, second] = captured;
    if (second !== null) return build(first, second);

    // Written as one run, the split is only recoverable at full width.
    if (first.length !== EASTING_DIGITS + NORTHING_DIGITS) {
      return fail(
        `${system} written without a separator must have ${EASTING_DIGITS + NORTHING_DIGITS} digits, ${EASTING_DIGITS} of easting and ${NORTHING_DIGITS} of northing, but got ${first.length}`,
      );
    }

    return build(first.slice(0, EASTING_DIGITS), first.slice(EASTING_DIGITS));
  });
};
