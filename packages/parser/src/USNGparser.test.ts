import { describe, expect, it } from "vitest";
import { USNG } from "./coordinateRegex.ts";
import { MGRSparser } from "./MGRSparser.ts";
import { type USNGCoordinate, USNGparser } from "./USNGparser.ts";

// Expectations follow FGDC-STD-011-2001 "United States National Grid" (FGDC, 2001). See the header
// of USNGparser.ts for the link and for what is deliberately left out.

const parse = (input: string): USNGCoordinate => {
  const result = USNGparser.run(input);
  if (result.isError) throw new Error(`expected "${input}" to parse, but got: ${result.error}`);
  return result.result;
};

const errorOf = (input: string): string => {
  const result = USNGparser.run(input);
  if (!result.isError) {
    throw new Error(`expected "${input}" to fail, but got: ${JSON.stringify(result.result)}`);
  }
  return result.error;
};

const accepts = (input: string) => !USNGparser.run(input).isError;

describe("grid zone designation and square", () => {
  it("reads the zone, band and 100 km square", () => {
    expect(parse("10S GJ 06832 44683")).toMatchObject({ zone: 10, band: "S", square: "GJ" });
  });

  it("accepts single- and double-digit zones", () => {
    expect(parse("1SGJ0683244683").zone).toBe(1);
    expect(parse("60XGJ0683244683").zone).toBe(60);
  });

  it("rejects zones outside 1-60", () => {
    expect(errorOf("0SGJ0644")).toBe('USNG zone must be between 1 and 60, but got "0"');
    expect(errorOf("61SGJ0644")).toBe('USNG zone must be between 1 and 60, but got "61"');
  });

  it.each(["I", "O"])("rejects latitude band %s", (band) => {
    expect(errorOf(`10${band}GJ0644`)).toContain("Expecting a latitude band letter");
  });

  it.each(["I", "O"])("rejects square column letter %s", (letter) => {
    expect(errorOf(`10S${letter}J0644`)).toContain("Expecting a 100 km square column letter");
  });

  it("stops the square row letter at V", () => {
    expect(parse("10SGV0644").square).toBe("GV");
    expect(errorOf("10SGW0644")).toContain("Expecting a 100 km square row letter");
  });
});

describe("precision ladder", () => {
  // The worked ladder from the FGDC material, all naming the same point at coarser resolution.
  it.each([
    ["10S GJ 06832 44683", 6832, 44683, 1],
    ["10S GJ 0683 4468", 6830, 44680, 10],
    ["10S GJ 068 446", 6800, 44600, 100],
    ["10S GJ 06 44", 6000, 44000, 1000],
    ["10S GJ 0 4", 0, 40000, 10000],
  ])("%s resolves to %i E, %i N at %i m", (input, easting, northing, precision) => {
    expect(parse(input)).toEqual({
      zone: 10,
      band: "S",
      square: "GJ",
      easting,
      northing,
      precision,
    });
  });

  it("bottoms out at 10 km — a bare 100 km square is not a USNG reference", () => {
    expect(errorOf("10S GJ")).toBe("USNG requires at least 1 digit per axis, but got 0");
  });

  it("rejects an odd number of digits", () => {
    expect(errorOf("10S GJ 123")).toBe(
      "USNG location must have an even number of digits, but got 3",
    );
  });

  it("rejects more than 5 digits per axis", () => {
    expect(errorOf("10S GJ 123456 123456")).toBe(
      "USNG allows at most 5 digits per axis, but got 6",
    );
  });

  it("rejects halves of unequal length", () => {
    expect(errorOf("10S GJ 068 44")).toBe(
      "USNG easting and northing must carry the same number of digits, but got 3 and 2",
    );
  });
});

describe("formatting tolerance", () => {
  const canonical = parse("10S GJ 06832 44683");

  it.each([
    ["10SGJ0683244683", "no spaces, the formal written form"],
    ["10sgj0683244683", "lowercase"],
    ["10S GJ 0683244683", "spaces around the square only"],
    ["  10S GJ 06832 44683  ", "padding around the input"],
  ])("accepts %j (%s)", (input) => {
    expect(parse(input)).toEqual(canonical);
  });

  it.each(["", "   ", "abc", "10S", "10S GJ 06832 44683 extra", "50.4501, 30.5234"])(
    "rejects %j",
    (input) => {
      expect(accepts(input)).toBe(false);
    },
  );
});

// USNG adopts the MGRS grid and only narrows it, so it cannot be told apart from MGRS by looking at
// the string. This is why USNGparser is not wired into coordinateParser: the choice would either
// never reach it, or relabel every MGRS reference as USNG. The distinguishing information is the
// datum, which the string does not carry.
describe("relationship to MGRS", () => {
  it.each(["10S GJ 06832 44683", "10S GJ 0 4", "10SGJ0683244683", "4QFJ1234567890", "10SGV0644"])(
    "%j is accepted by both parsers",
    (input) => {
      expect(accepts(input)).toBe(true);
      expect(MGRSparser.run(input).isError).toBe(false);
    },
  );

  it.each(["4QFJ", "10S GJ"])("%j is MGRS only — a bare 100 km square", (input) => {
    expect(MGRSparser.run(input).isError).toBe(false);
    expect(accepts(input)).toBe(false);
  });
});

// The baseline regex validates shape loosely: it accepts the reserved letters, any zone number and
// up to 8 digits per axis. Every disagreement below is the regex admitting a non-reference.
describe("USNG regex baseline", () => {
  it.each([
    ["10IGJ0644", "band I is reserved"],
    ["10SOJ0644", "square column letter O is reserved"],
    ["10SGW0644", "square row letters stop at V"],
    ["0SGJ0644", "zone 0 does not exist"],
    ["61SGJ0644", "zone 61 does not exist"],
    ["10SGJ12345612345", "unequal halves"],
    ["10SGJ123456781234567", "more than 5 digits per axis"],
    ["10S GJ 068 44", "unequal halves, written separately"],
    ["10S GJ", "USNG requires at least one digit per axis"],
  ])("regex wrongly accepts %j — %s", (input) => {
    expect(USNG.test(input)).toBe(true);
    expect(accepts(input)).toBe(false);
  });

  it("regex wrongly rejects surrounding whitespace, tolerated everywhere else in the library", () => {
    expect(USNG.test("  10S GJ 06832 44683  ")).toBe(false);
    expect(accepts("  10S GJ 06832 44683  ")).toBe(true);
  });

  it.each(["10S GJ 06832 44683", "10SGJ0683244683", "10S GJ 0 4"])("both accept %j", (input) => {
    expect(USNG.test(input)).toBe(true);
    expect(accepts(input)).toBe(true);
  });

  it.each(["", "abc"])("both reject %j", (input) => {
    expect(USNG.test(input)).toBe(false);
    expect(accepts(input)).toBe(false);
  });
});
