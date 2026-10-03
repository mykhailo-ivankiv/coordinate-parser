import { describe, expect, it } from "vitest";
import { type Coordinates } from "./commonParsers.ts";
import { DD } from "./coordinateRegex.ts";
import { DDparser } from "./DDparser.ts";

// Expectations follow the human-readable notation of ISO 6709 Annex D. See the header of
// DDparser.ts for how it relates to the signed Annex H notation that WGS84parser reads.

const parse = (input: string): Coordinates => {
  const result = DDparser.run(input);
  if (result.isError) throw new Error(`expected "${input}" to parse, but got: ${result.error}`);
  return result.result;
};

const errorOf = (input: string): string => {
  const result = DDparser.run(input);
  if (!result.isError) {
    throw new Error(`expected "${input}" to fail, but got: ${JSON.stringify(result.result)}`);
  }
  return result.error;
};

const accepts = (input: string) => !DDparser.run(input).isError;

const kyiv: Coordinates = { latitude: 50.4501, longitude: 30.5234 };

describe("hemisphere letters carry the direction", () => {
  it.each([
    ["50.4501°N, 30.5234°E", 50.4501, 30.5234],
    ["33.8688°S, 151.2093°E", -33.8688, 151.2093],
    ["40.7128°N, 74.0060°W", 40.7128, -74.006],
    ["22.9068°S, 43.1729°W", -22.9068, -43.1729],
  ])("%j resolves to %f, %f", (input, latitude, longitude) => {
    expect(parse(input)).toEqual({ latitude, longitude });
  });

  it("requires a latitude letter, which is what separates DD from WGS84", () => {
    expect(errorOf("50.4501, 30.5234")).toContain("Expecting a hemisphere letter N or S");
  });

  it("will not take E or W where a latitude belongs", () => {
    expect(errorOf("50.4501°E, 30.5234°N")).toContain("Expecting a hemisphere letter N or S");
  });

  it("rejects a written sign, which would state the direction twice", () => {
    expect(errorOf("-50.4501°N, 30.5234°E")).toBe(
      'a sign is not allowed where a hemisphere letter gives the direction, but got "-"',
    );
    expect(errorOf("+50.4501°N, 30.5234°E")).toBe(
      'a sign is not allowed where a hemisphere letter gives the direction, but got "+"',
    );
  });
});

describe("ranges", () => {
  it("accepts the poles and the antimeridian", () => {
    expect(parse("90°N, 180°E")).toEqual({ latitude: 90, longitude: 180 });
    expect(parse("90°S, 180°W")).toEqual({ latitude: -90, longitude: -180 });
    expect(parse("0°N, 0°E")).toEqual({ latitude: 0, longitude: 0 });
  });

  it("rejects magnitudes past the poles and the antimeridian", () => {
    expect(errorOf("90.1°N, 30°E")).toBe("latitude must be between -90 and 90, but got 90.1");
    expect(errorOf("50°N, 180.1°E")).toBe("longitude must be between -180 and 180, but got 180.1");
  });
});

describe("precision", () => {
  it("accepts up to 7 decimal places, the limit used across this library", () => {
    expect(parse("50.1234567°N, 30°E").latitude).toBe(50.1234567);
  });

  it("rejects more", () => {
    expect(errorOf("50.12345678°N, 30°E")).toBe(
      "at most 7 decimal places are supported, but got 8",
    );
  });
});

describe("formatting tolerance", () => {
  it.each([
    ["50.4501N, 30.5234E", "no degree sign"],
    ["50.4501°N 30.5234°E", "space instead of a comma"],
    ["50.4501n, 30.5234e", "lowercase letters"],
    ["50.4501 °N, 30.5234 °E", "space before the degree sign"],
    ["50.4501° N, 30.5234° E", "space before the letter"],
    ["  50.4501°N, 30.5234°E  ", "padding around the input"],
  ])("accepts %j (%s)", (input) => {
    expect(parse(input)).toEqual(kyiv);
  });

  it.each([
    "",
    "   ",
    "abc",
    "50.4501°N",
    "50°N, 30°X",
    "50.4501°N, 30.5234°E, 7",
    "4QFJ1234567890",
  ])("rejects %j", (input) => {
    expect(accepts(input)).toBe(false);
  });
});

// The best-written pattern in coordinateRegex.ts: it excludes signs, bounds both magnitudes and
// restricts 90 and 180 to whole degrees. The parser accepts everything it does, and differs only by
// being more forgiving about how the same value is typed.
describe("DD regex baseline", () => {
  it("has no gaps — the parser accepts everything the regex accepts", () => {
    const acceptedByRegex = [
      "50.4501°N, 30.5234°E",
      "90°N, 180°E",
      "0°N, 0°E",
      "50.123456°N, 30°E",
      "89.999999°S, 179.999999°W",
    ];
    for (const input of acceptedByRegex) {
      expect(DD.test(input)).toBe(true);
      expect(accepts(input)).toBe(true);
    }
  });

  it.each([
    ["50.1234567°N, 30°E", "a seventh decimal place, allowed elsewhere in this library"],
    ["50.4501N, 30.5234E", "no degree sign"],
    ["50.4501°N 30.5234°E", "space instead of a comma"],
    ["  50.4501°N, 30.5234°E  ", "surrounding whitespace"],
    ["90.0°N, 30°E", "the pole written with a redundant decimal zero"],
    ["50°N, 180.0°E", "the antimeridian written with a redundant decimal zero"],
  ])("regex rejects %j, parser accepts — %s", (input) => {
    expect(DD.test(input)).toBe(false);
    expect(accepts(input)).toBe(true);
  });

  it.each(["-50°N, 30°E", "90.5°N, 30°E", "50°N, 30°X", "", "abc"])("both reject %j", (input) => {
    expect(DD.test(input)).toBe(false);
    expect(accepts(input)).toBe(false);
  });
});
