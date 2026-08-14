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
  "SK42",
  "USNG",
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
const decimalDegrees = sequenceOf([
  possibly(anyOfString("+-")),
  digits,
  // Explicit type arguments: takeRight declares R on the outer call, so it would
  // otherwise be inferred as unknown before `digits` is ever supplied.
  possibly(takeRight<string, string>(char("."))(digits)),
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

export const latitude = decimalDegrees.chain(withinRange("latitude", 90));
export const longitude = decimalDegrees.chain(withinRange("longitude", 180));

// A comma (optionally padded with spaces) or plain whitespace. The comma branch is
// tried first so that " , " is not half-consumed by the whitespace branch.
const separator = choice([
  sequenceOf([optionalWhitespace, char(","), optionalWhitespace]),
  whitespace,
]).errorMap(
  ({ index }) =>
    `ParseError (position ${index}): Expecting ',' or whitespace between the two values`,
);

const wholeInput = <T>(parser: Parser<T>) =>
  sequenceOf([startOfInput, optionalWhitespace, parser, optionalWhitespace, endOfInput]).map(
    ([, , value]) => value,
  );

export const WGS84parser = wholeInput(
  sequenceOf([latitude, separator, longitude]).map(([lat, , lon]): Coordinates => ({
    latitude: lat,
    longitude: lon,
  })),
);

export const WGS84Rparser = wholeInput(
  sequenceOf([longitude, separator, latitude]).map(([lon, , lat]): Coordinates => ({
    latitude: lat,
    longitude: lon,
  })),
);

export const coordinateParser = choice([
  WGS84parser.map((coords) => ({ ...coords, system: "WGS84" })),
  WGS84Rparser.map((coords) => ({ ...coords, system: "WGS84R" })),
]);
