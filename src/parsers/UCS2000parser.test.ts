import { describe, expect, it } from "vitest";
import { UCS2000 } from "./coordinateRegex.ts";
import { type UCS2000Coordinate, UCS2000parser } from "./UCS2000parser.ts";

// Expectations follow EPSG:5561 / EPSG:5562-5565 for the geodesy (the zone number is the leading
// digit of Y, six digits of easting follow) and the ЗСУ "Довідник з військової топографії" for the
// write format. See the header of UCS2000parser.ts for the links and the establishing act.

const parse = (input: string): UCS2000Coordinate => {
  const result = UCS2000parser.run(input);
  if (result.isError) throw new Error(`expected "${input}" to parse, but got: ${result.error}`);
  return result.result;
};

const errorOf = (input: string): string => {
  const result = UCS2000parser.run(input);
  if (!result.isError) {
    throw new Error(`expected "${input}" to fail, but got: ${JSON.stringify(result.result)}`);
  }
  return result.error;
};

const accepts = (input: string) => !UCS2000parser.run(input).isError;

const kyivZone: UCS2000Coordinate = { zone: 6, northing: 5591000, easting: 325000 };

describe("zone prefix", () => {
  it("splits the leading digit of Y from the easting", () => {
    expect(parse("5591000 6325000")).toEqual(kyivZone);
  });

  it.each([4, 5, 6, 7])("accepts zone %i, which covers Ukraine", (zone) => {
    expect(parse(`5591000 ${zone}325000`)).toMatchObject({ zone, easting: 325000 });
  });

  it("keeps 500000 as the central meridian offset", () => {
    expect(parse("5591000 6500000").easting).toBe(500000);
  });

  it.each(["3", "8", "0"])("rejects zone %s, outside Ukraine", (zone) => {
    expect(errorOf(`5591000 ${zone}325000`)).toBe(
      `UCS-2000 zone must be between 4 and 7, the zones covering Ukraine, but got "${zone}"`,
    );
  });

  it("rejects an eight-digit easting — UCS-2000 has no two-digit zones", () => {
    expect(errorOf("5591000 12325000")).toBe(
      "UCS-2000 easting must be a zone digit followed by 6 digits, so 7 digits in total, but got 8",
    );
  });

  it("rejects a negative easting, which the zone prefix rules out", () => {
    expect(errorOf("5591000 -6325000")).toBe(
      "UCS-2000 easting carries a zone prefix and cannot be negative",
    );
  });
});

describe("northing", () => {
  it("requires exactly 7 digits", () => {
    expect(errorOf("559100 6325000")).toBe("UCS-2000 northing must have 7 digits, but got 6");
    expect(errorOf("55910000 6325000")).toBe("UCS-2000 northing must have 7 digits, but got 8");
  });

  it("accepts an explicit sign", () => {
    expect(parse("+5591000 6325000")).toEqual(kyivZone);
    expect(parse("-5591000 6325000").northing).toBe(-5591000);
  });
});

describe("the worked example from the Довідник", () => {
  // Х = 60 80км + 600м = 60 80 600; Y = 43 08км + 1 700м = 43 09 700. The handbook's illustrative
  // northing sits north of Ukraine, but the digit layout is exactly what this parser decodes.
  it("splits 6080600 4309700 into zone 4, northing and easting", () => {
    expect(parse("6080600 4309700")).toEqual({ zone: 4, northing: 6080600, easting: 309700 });
  });
});

describe("formatting tolerance", () => {
  it.each([
    ["55-91000 63-25000", "grouping hyphens"],
    ["5591000, 6325000", "comma and space"],
    ["5591000,6325000", "comma only"],
    ["5591000  6325000", "several spaces"],
    ["5591000\t6325000", "tab"],
    ["  5591000 6325000  ", "padding around the input"],
  ])("accepts %j (%s)", (input) => {
    expect(parse(input)).toEqual(kyivZone);
  });

  it.each(["5591000", "", "   ", "abc", "5591000 6325000 7", "50.4501, 30.5234", "4QFJ1234567890"])(
    "rejects %j",
    (input) => {
      expect(accepts(input)).toBe(false);
    },
  );
});

// The baseline regex was written for СК-42, before the rename to UCS-2000, and it validates digit
// counts only. Now that zones are restricted to the four covering Ukraine, every disagreement is
// the regex admitting something UCS-2000 does not define.
describe("UCS2000 regex baseline", () => {
  it.each([
    ["5591000 3325000", "zone 3 is west of Ukraine"],
    ["5591000 8325000", "zone 8 is east of Ukraine"],
    ["5591000 0325000", "zone 0 does not exist"],
    ["5591000 -6325000", "a negative easting is meaningless behind a zone prefix"],
    ["5591000,,6325000", "a repeated separator is not a separator"],
  ])("regex wrongly accepts %j — %s", (input) => {
    expect(UCS2000.test(input)).toBe(true);
    expect(accepts(input)).toBe(false);
  });

  it("regex wrongly rejects surrounding whitespace, tolerated everywhere else in the library", () => {
    expect(UCS2000.test("  5591000 6325000  ")).toBe(false);
    expect(accepts("  5591000 6325000  ")).toBe(true);
  });

  it.each([
    "5591000 6325000",
    "55-91000 63-25000",
    "5591000,6325000",
    "5591000, 6325000",
    "5591000  6325000",
    "-5591000 6325000",
  ])("both accept %j", (input) => {
    expect(UCS2000.test(input)).toBe(true);
    expect(accepts(input)).toBe(true);
  });

  it.each([
    "5591000 12325000",
    "559100 6325000",
    "55910000 6325000",
    "5591000 632500",
    "5591000",
    "",
    "abc",
    "5591000 6325000 7",
  ])("both reject %j", (input) => {
    expect(UCS2000.test(input)).toBe(false);
    expect(accepts(input)).toBe(false);
  });
});
