import {
  anyOfString,
  char,
  choice,
  digits,
  endOfInput,
  fail,
  optionalWhitespace,
  type Parser,
  possibly,
  sequenceOf,
  startOfInput,
  succeedWith,
  takeRight,
  whitespace,
} from "arcsecond";

export const coordinateSystems = [
  "WGS84",
  "WGS84R",
  "MGRS",
  "UCS-2000",
  "USNG",
  //
  "UTM",
  "DD",
  "DDM",
  "DMS",
];

export type Coordinates = { latitude: number; longitude: number };

const MAX_FRACTION_DIGITS = 7;

// The fractional part stays greedy and is checked afterwards, rather than being capped
// at MAX_FRACTION_DIGITS in the grammar: capping would leave the extra digits unconsumed
// and surface as a confusing "expecting a separator" error further along the input.
const decimalDegrees = (decimalMark: string) =>
  sequenceOf([
    possibly(anyOfString("+-")),
    digits,
    // Explicit type arguments: takeRight declares R on the outer call, so it would
    // otherwise be inferred as unknown before `digits` is ever supplied.
    possibly(takeRight<string, string>(char(decimalMark))(digits)),
  ]).chain((parts?: [string | null, string, string | null]): Parser<number> => {
    if (parts === undefined) return fail("Expecting a decimal number");

    const [sign, whole, fraction] = parts;
    if (fraction !== null && fraction.length > MAX_FRACTION_DIGITS) {
      return fail(
        `at most ${MAX_FRACTION_DIGITS} decimal places are supported, but got ${fraction.length}`,
      );
    }

    return succeedWith(Number(`${sign ?? ""}${whole}.${fraction ?? "0"}`));
  });

const withinRange =
  (name: string, limit: number) =>
  (value?: number): Parser<number> =>
    value !== undefined && Math.abs(value) <= limit
      ? succeedWith(value)
      : fail(`${name} must be between -${limit} and ${limit}, but got ${value}`);

export const latitude = decimalDegrees(".").chain(withinRange("latitude", 90));
export const longitude = decimalDegrees(".").chain(withinRange("longitude", 180));

export const europeanLatitude = decimalDegrees(",").chain(withinRange("latitude", 90));
export const europeanLongitude = decimalDegrees(",").chain(withinRange("longitude", 180));

// A comma (optionally padded with spaces) or plain whitespace. The comma branch is
// tried first so that " , " is not half-consumed by the whitespace branch.
export const commaOrWhitespace = choice([
  sequenceOf([optionalWhitespace, char(","), optionalWhitespace]),
  whitespace,
]).errorMap(
  ({ index }) =>
    `ParseError (position ${index}): Expecting ',' or whitespace between the two values`,
);

// European formats spend the comma on the decimal mark, so whitespace is all that is
// left to separate the two values.
export const whitespaceOnly = whitespace.errorMap(
  ({ index }) => `ParseError (position ${index}): Expecting whitespace between the two values`,
);

export const wholeInput = <T>(parser: Parser<T>) =>
  sequenceOf([startOfInput, optionalWhitespace, parser, optionalWhitespace, endOfInput]).map(
    ([, , value]) => value,
  );

export const latitudeFirst = (
  lat: Parser<number>,
  separator: Parser<unknown>,
  lon: Parser<number>,
) =>
  wholeInput(
    sequenceOf([lat, separator, lon]).map(([latitude, , longitude]): Coordinates => ({
      latitude,
      longitude,
    })),
  );

export const longitudeFirst = (
  lon: Parser<number>,
  separator: Parser<unknown>,
  lat: Parser<number>,
) =>
  wholeInput(
    sequenceOf([lon, separator, lat]).map(([longitude, , latitude]): Coordinates => ({
      latitude,
      longitude,
    })),
  );
