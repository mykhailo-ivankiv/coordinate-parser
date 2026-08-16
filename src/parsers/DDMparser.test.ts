import { describe, expect, it } from "vitest";
import { type Coordinates } from "./commonParsers.ts";
import { DDM } from "./coordinateRegex.ts";
import { DDMparser } from "./DDMparser.ts";
import { DMSparser } from "./DMSparser.ts";

// Expectations follow the ISO 6709 Annex D notation. See the header of sexagesimal.ts for how the
// three notations in that family relate.

const parse = (input: string): Coordinates => {
  const result = DDMparser.run(input);
  if (result.isError) throw new Error(`expected "${input}" to parse, but got: ${result.error}`);
  return result.result;
};

const errorOf = (input: string): string => {
  const result = DDMparser.run(input);
  if (!result.isError) {
    throw new Error(`expected "${input}" to fail, but got: ${JSON.stringify(result.result)}`);
  }
  return result.error;
};

const accepts = (input: string) => !DDMparser.run(input).isError;

// 50.4501° = 50° + 0.4501 × 60 = 50° 27.006'
const kyiv: Coordinates = { latitude: 50.4501, longitude: 30.5234 };

describe("degrees and decimal minutes", () => {
  it("converts minutes to the decimal degrees the other notations report", () => {
    expect(parse("50° 27.006'N, 30° 31.404'E")).toEqual(kyiv);
  });

  it("accepts whole minutes", () => {
    expect(parse("50° 27'N, 30° 31'E")).toEqual({ latitude: 50.45, longitude: 30.5166667 });
  });

  it("applies the hemisphere letter to the assembled angle", () => {
    expect(parse("33° 52.128'S, 151° 12.558'W")).toEqual({
      latitude: -33.8688,
      longitude: -151.2093,
    });
  });

  it("rejects minutes at or past 60, which belong in the degrees", () => {
    expect(errorOf("50° 60'N, 30° 0'E")).toBe("latitude minutes must be less than 60, but got 60");
    expect(errorOf("50° 69'N, 30° 0'E")).toBe("latitude minutes must be less than 60, but got 69");
  });
});

describe("ranges", () => {
  it("accepts the poles and the antimeridian", () => {
    expect(parse("0° 0'N, 0° 0'E")).toEqual({ latitude: 0, longitude: 0 });
    expect(parse("90° 0'N, 180° 0'E")).toEqual({ latitude: 90, longitude: 180 });
  });

  // The angle is reduced before the check, so the boundary needs no special case in the grammar.
  it("rejects an angle that only exceeds the limit once the minutes are added", () => {
    expect(errorOf("90° 1'N, 30° 0'E")).toContain("latitude must be between 0 and 90 degrees");
    expect(errorOf("180° 1'N, 30° 0'E")).toContain("latitude must be between 0 and 90 degrees");
  });
});

describe("formatting tolerance", () => {
  it.each([
    ["50°27.006'N, 30°31.404'E", "no spaces"],
    ["50 27.006'N 30 31.404'E", "no degree sign, space separator"],
    ["50° 27.006′N, 30° 31.404′E", "typographic prime as the minute mark"],
    ["50° 27.006'n, 30° 31.404'e", "lowercase hemisphere letters"],
    ["  50° 27.006'N, 30° 31.404'E  ", "padding around the input"],
  ])("accepts %j (%s)", (input) => {
    expect(parse(input)).toEqual(kyiv);
  });

  it("requires the minute mark, which is what separates DDM from DD", () => {
    expect(errorOf("50° 27.006N, 30° 31.404E")).toContain("Expecting a minute mark");
  });

  it("rejects a written sign, since the hemisphere letter gives the direction", () => {
    expect(accepts("-50° 27'N, 30° 31'E")).toBe(false);
  });

  it.each(["", "   ", "abc", "50° 27.006'N", "50.4501°N, 30.5234°E"])("rejects %j", (input) => {
    expect(accepts(input)).toBe(false);
  });
});

// DDM takes decimal minutes and stops there; DMS takes whole minutes and adds seconds. Neither can
// consume the other's input, so they need no ordering in a choice.
describe("disjoint from DMS", () => {
  it("will not take a DMS reference", () => {
    expect(accepts(`50° 27' 0.36"N, 30° 31' 24.24"E`)).toBe(false);
  });

  it("is not taken by DMS either", () => {
    expect(DMSparser.run("50° 27.006'N, 30° 31.404'E").isError).toBe(true);
  });
});

// The baseline pattern spells its minutes `0?[1-6]?\d`, which reaches 69.
describe("DDM regex baseline", () => {
  it.each([
    ["50° 60'N, 30° 0'E", "60 minutes is a whole degree"],
    ["50° 69'N, 30° 0'E", "the minute pattern reaches 69"],
  ])("regex wrongly accepts %j — %s", (input) => {
    expect(DDM.test(input)).toBe(true);
    expect(accepts(input)).toBe(false);
  });

  it.each([
    ["50°27.006'N, 30°31.404'E", "no spaces around the degree sign"],
    ["  50° 27.006'N, 30° 31.404'E  ", "surrounding whitespace"],
    ["50° 27.006′N, 30° 31.404′E", "typographic prime"],
  ])("regex wrongly rejects %j — %s", (input) => {
    expect(DDM.test(input)).toBe(false);
    expect(accepts(input)).toBe(true);
  });

  it.each(["50° 27.006'N, 30° 31.404'E", "50° 27'N, 30° 31'E"])("both accept %j", (input) => {
    expect(DDM.test(input)).toBe(true);
    expect(accepts(input)).toBe(true);
  });

  it.each(["90° 1'N, 30° 0'E", "", "abc"])("both reject %j", (input) => {
    expect(DDM.test(input)).toBe(false);
    expect(accepts(input)).toBe(false);
  });
});
