import {
  anyOfString,
  digits,
  fail,
  type Parser,
  possibly,
  sequenceOf,
  succeedWith,
  takeRight,
  whitespace,
} from "arcsecond";

// Grammar shared by the grid reference systems. MGRS defines the grid (NGA.STND.0037) and USNG
// adopts it wholesale (FGDC-STD-011-2001), so the letter sets, the zone number and the numeric
// location are one grammar with a couple of parameters rather than two near-copies.

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

// References are conventionally uppercase; lowercase is accepted and normalised, since no
// part of a reference is case-sensitive.
export const letterFrom = (allowed: string, expected: string) =>
  anyOfString(`${allowed}${allowed.toLowerCase()}`)
    .errorMap(
      ({ index }) => `ParseError (position ${index}): Expecting ${expected}, one of ${allowed}`,
    )
    .map((letter) => letter.toUpperCase());

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
