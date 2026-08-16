import {
  char,
  choice,
  digits,
  fail,
  optionalWhitespace,
  type Parser,
  possibly,
  sequenceOf,
  str,
  succeedWith,
  takeRight,
} from "arcsecond";
import { letterFrom, MAX_FRACTION_DIGITS } from "./commonParsers.ts";

// The sexagesimal notations of ISO 6709 Annex D, shared by DD, DDM and DMS.
// https://www.iso.org/standard/75147.html
//
//   DD    50.4501°N          degrees, decimal
//   DDM   50° 27.006'N       degrees and decimal minutes
//   DMS   50° 27' 0.36"N     degrees, minutes and decimal seconds
//
// Each notation carries one more whole component than the last, and only the final component takes
// a fraction. All three end in a hemisphere letter, which is what carries direction: none of them
// accepts a sign, and the magnitude parsers they are built on reject one outright.
//
// Every angle is reduced to decimal degrees before it is range-checked, so the awkward boundary
// cases fall out on their own: 90°0'0" is a valid latitude, 90°0'1" is not, and neither needs a
// special case in the grammar.

export const DEGREE_SIGN = "°";

// ASCII apostrophe and quote are what a keyboard produces; the prime and double prime are what
// typesetting produces, and are what ISO 6709 Annex D prints. Two apostrophes are a common stand-in
// for a double prime. All spellings are accepted.
const MINUTE_MARK = choice([char("'"), char("′")]).errorMap(
  ({ index }) => `ParseError (position ${index}): Expecting a minute mark, ' or ′`,
);

const SECOND_MARK = choice([str("''"), char('"'), char("″")]).errorMap(
  ({ index }) => `ParseError (position ${index}): Expecting a second mark, " or '' or ″`,
);

const SEXAGESIMAL_LIMIT = 60;

const wholeNumber = digits.map(Number);

const decimalNumber = sequenceOf([
  digits,
  possibly(takeRight<string, string>(char("."))(digits)),
]).chain((parts?: [string, string | null]): Parser<number> => {
  if (parts === undefined) return fail("Expecting a number");

  const [whole, fraction] = parts;
  if (fraction !== null && fraction.length > MAX_FRACTION_DIGITS) {
    return fail(
      `at most ${MAX_FRACTION_DIGITS} decimal places are supported, but got ${fraction.length}`,
    );
  }

  return succeedWith(Number(`${whole}.${fraction ?? "0"}`));
});

const below60 =
  (what: string) =>
  (value?: number): Parser<number> =>
    value !== undefined && value < SEXAGESIMAL_LIMIT
      ? succeedWith(value)
      : fail(`${what} must be less than ${SEXAGESIMAL_LIMIT}, but got ${value}`);

const withinLimit =
  (name: string, limit: number) =>
  (value?: number): Parser<number> =>
    value !== undefined && value <= limit
      ? succeedWith(value)
      : fail(`${name} must be between 0 and ${limit} degrees, but got ${value}`);

// The degree sign is optional throughout: it is a typographic mark rather than information, and a
// keyboard rarely offers it. The hemisphere letter is what identifies the notation.
const degreeMark = sequenceOf([optionalWhitespace, possibly(str(DEGREE_SIGN)), optionalWhitespace]);

// Dividing by 60 and 3600 leaves binary floating point residue: 50° 27' 0.36" lands on
// 50.450100000000006 rather than 50.4501. Rounding to the precision this library already declares
// clears the noise without discarding anything real — the seventh decimal place is about a
// centimetre, finer than any sexagesimal input can meaningfully carry. Applied after the range
// check, so a value that only reaches the limit by rounding is still rejected.
const toDeclaredPrecision = (degrees: number) => {
  const scale = 10 ** MAX_FRACTION_DIGITS;
  return Math.round(degrees * scale) / scale;
};

/** Degrees and decimal minutes: 50° 27.006' */
export const degreesMinutes = (name: string, limit: number) =>
  sequenceOf([
    wholeNumber,
    degreeMark,
    decimalNumber.chain(below60(`${name} minutes`)),
    optionalWhitespace,
    MINUTE_MARK,
  ])
    .map(([degrees, , minutes]) => degrees + minutes / 60)
    .chain(withinLimit(name, limit))
    .map(toDeclaredPrecision);

/** Degrees, whole minutes and decimal seconds: 50° 27' 0.36" */
export const degreesMinutesSeconds = (name: string, limit: number) =>
  sequenceOf([
    wholeNumber,
    degreeMark,
    wholeNumber.chain(below60(`${name} minutes`)),
    optionalWhitespace,
    MINUTE_MARK,
    optionalWhitespace,
    decimalNumber.chain(below60(`${name} seconds`)),
    optionalWhitespace,
    SECOND_MARK,
  ])
    .map(([degrees, , minutes, , , , seconds]) => degrees + minutes / 60 + seconds / 3600)
    .chain(withinLimit(name, limit))
    .map(toDeclaredPrecision);

/** Plain decimal degrees with an optional degree sign, the DD notation. */
export const decimalDegreesAngle = (magnitude: Parser<number>) =>
  sequenceOf([magnitude, degreeMark]).map(([degrees]) => degrees);

/** Applies the direction the trailing hemisphere letter names. */
export const withHemisphere = (
  angle: Parser<number>,
  hemispheres: string,
  expected: string,
  negative: string,
) =>
  sequenceOf([angle, optionalWhitespace, letterFrom(hemispheres, expected)]).map(
    ([degrees, , hemisphere]) => (hemisphere === negative ? -degrees : degrees),
  );

export const LATITUDE_HEMISPHERES = "NS";
export const LONGITUDE_HEMISPHERES = "EW";
export const LATITUDE_EXPECTED = "a hemisphere letter N or S";
export const LONGITUDE_EXPECTED = "a hemisphere letter E or W";
