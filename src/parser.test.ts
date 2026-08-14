import { describe, expect, it } from "vitest";
import type { Parser } from "arcsecond";
import { type Coordinates, latitude, longitude } from "./parsers/commonParsers.ts";
import { coordinateParser } from "./parsers/coordinateParser.ts";
import { EuropeanWGS84parser } from "./parsers/EuropeanWGS84parser.ts";
import { EuropeanWGS84Rparser } from "./parsers/EuropeanWGS84Rparser.ts";
import { WGS84parser } from "./parsers/WGS84parser.ts";
import { WGS84Rparser } from "./parsers/WGS84Rparser.ts";

const parsed = <T>(parser: Parser<T>, input: string): T => {
  const result = parser.run(input);
  if (result.isError) throw new Error(`expected "${input}" to parse, but got: ${result.error}`);
  return result.result;
};

const errorOf = <T>(parser: Parser<T>, input: string): string => {
  const result = parser.run(input);
  if (!result.isError) {
    throw new Error(`expected "${input}" to fail, but got: ${JSON.stringify(result.result)}`);
  }
  return result.error;
};

const kyiv: Coordinates = { latitude: 50.4501, longitude: 30.5234 };

describe("latitude", () => {
  it("accepts the full range", () => {
    expect(parsed(latitude, "0")).toBe(0);
    expect(parsed(latitude, "90")).toBe(90);
    expect(parsed(latitude, "-90")).toBe(-90);
    expect(parsed(latitude, "50.4501")).toBe(50.4501);
  });

  it("accepts an explicit plus sign", () => {
    expect(parsed(latitude, "+50.4501")).toBe(50.4501);
  });

  it("rejects values outside ±90", () => {
    expect(errorOf(latitude, "90.1")).toBe("latitude must be between -90 and 90, but got 90.1");
    expect(errorOf(latitude, "-91")).toBe("latitude must be between -90 and 90, but got -91");
  });
});

describe("longitude", () => {
  it("accepts the full range", () => {
    expect(parsed(longitude, "180")).toBe(180);
    expect(parsed(longitude, "-180")).toBe(-180);
  });

  it("rejects values outside ±180", () => {
    expect(errorOf(longitude, "180.1")).toBe(
      "longitude must be between -180 and 180, but got 180.1",
    );
  });
});

describe("precision", () => {
  it("accepts up to 7 decimal places", () => {
    expect(parsed(latitude, "50.1234567")).toBe(50.1234567);
    expect(parsed(latitude, "50.0000000")).toBe(50);
  });

  it("rejects more than 7 decimal places", () => {
    expect(errorOf(latitude, "50.12345678")).toBe(
      "at most 7 decimal places are supported, but got 8",
    );
    expect(errorOf(latitude, "50.1234567890")).toBe(
      "at most 7 decimal places are supported, but got 10",
    );
  });

  it("applies the limit to the second value too", () => {
    expect(errorOf(WGS84parser, "50.5, 30.12345678")).toBe(
      "at most 7 decimal places are supported, but got 8",
    );
  });
});

describe("WGS84parser", () => {
  it("reads latitude first", () => {
    expect(parsed(WGS84parser, "50.4501, 30.5234")).toEqual(kyiv);
  });

  it.each([
    ["50.4501, 30.5234", "comma and space"],
    ["50.4501,30.5234", "comma only"],
    ["50.4501 30.5234", "single space"],
    ["50.4501   30.5234", "several spaces"],
    ["50.4501\t30.5234", "tab"],
    ["  50.4501 , 30.5234  ", "padding around the input and the comma"],
    ["+50.4501, +30.5234", "explicit plus signs"],
  ])("accepts %j (%s)", (input) => {
    expect(parsed(WGS84parser, input)).toEqual(kyiv);
  });

  it.each([
    ["0, 0", { latitude: 0, longitude: 0 }],
    ["90, 0", { latitude: 90, longitude: 0 }],
    ["-90, 0", { latitude: -90, longitude: 0 }],
    ["0, 180", { latitude: 0, longitude: 180 }],
    ["0, -180", { latitude: 0, longitude: -180 }],
  ])("accepts the boundary value %j", (input, expected) => {
    expect(parsed(WGS84parser, input)).toEqual(expected);
  });

  it.each([
    ["40.7128, -74.0060", { latitude: 40.7128, longitude: -74.006 }],
    ["-33.8688, 151.2093", { latitude: -33.8688, longitude: 151.2093 }],
    ["-22.9068, -43.1729", { latitude: -22.9068, longitude: -43.1729 }],
  ])("signs select the hemisphere for %j", (input, expected) => {
    expect(parsed(WGS84parser, input)).toEqual(expected);
  });

  it("requires a separator", () => {
    expect(errorOf(WGS84parser, "50.450130.5234")).toContain(
      "Expecting ',' or whitespace between the two values",
    );
  });

  it("requires both values", () => {
    expect(errorOf(WGS84parser, "50.4501")).toContain(
      "Expecting ',' or whitespace between the two values",
    );
  });

  it("rejects trailing content", () => {
    expect(errorOf(WGS84parser, "50.4501, 30.5234, 7")).toContain("Expected end of input");
  });

  it.each(["", "   ", "abc", "50.4501N, 30.5234E", "50.4501; 30.5234"])("rejects %j", (input) => {
    expect(() => parsed(WGS84parser, input)).toThrow();
  });
});

describe("WGS84Rparser", () => {
  it("reads longitude first", () => {
    expect(parsed(WGS84Rparser, "30.5234, 50.4501")).toEqual(kyiv);
  });

  it("applies the range limits in reversed order", () => {
    expect(parsed(WGS84Rparser, "151.2093 -33.8688")).toEqual({
      latitude: -33.8688,
      longitude: 151.2093,
    });
    expect(errorOf(WGS84Rparser, "181, 50")).toBe(
      "longitude must be between -180 and 180, but got 181",
    );
    expect(errorOf(WGS84Rparser, "30, 91")).toBe("latitude must be between -90 and 90, but got 91");
  });

  it("differs from WGS84parser when both orders are in range", () => {
    expect(parsed(WGS84parser, "50.4501 30.5234")).toEqual(kyiv);
    expect(parsed(WGS84Rparser, "50.4501 30.5234")).toEqual({
      latitude: 30.5234,
      longitude: 50.4501,
    });
  });
});

describe("EuropeanWGS84parser", () => {
  it("reads a comma as the decimal mark", () => {
    expect(parsed(EuropeanWGS84parser, "50,4501 30,5234")).toEqual(kyiv);
  });

  it.each([
    ["50,4501 30,5234", "single space"],
    ["50,4501   30,5234", "several spaces"],
    ["  50,4501 30,5234  ", "padding around the input"],
    ["-33,8688 151,2093", "negative latitude"],
  ])("accepts %j (%s)", (input) => {
    expect(() => parsed(EuropeanWGS84parser, input)).not.toThrow();
  });

  it("accepts whole degrees with no decimal mark at all", () => {
    expect(parsed(EuropeanWGS84parser, "50 30")).toEqual({ latitude: 50, longitude: 30 });
  });

  it("rejects a comma as the value separator", () => {
    expect(errorOf(EuropeanWGS84parser, "50,4501, 30,5234")).toContain(
      "Expecting whitespace between the two values",
    );
  });

  it("rejects a dot as the decimal mark", () => {
    expect(errorOf(EuropeanWGS84parser, "50.4501 30.5234")).toContain(
      "Expecting whitespace between the two values",
    );
  });

  it("still enforces ranges and precision", () => {
    expect(errorOf(EuropeanWGS84parser, "91,0 30,0")).toBe(
      "latitude must be between -90 and 90, but got 91",
    );
    expect(errorOf(EuropeanWGS84parser, "50,12345678 30,5")).toBe(
      "at most 7 decimal places are supported, but got 8",
    );
  });
});

describe("EuropeanWGS84Rparser", () => {
  it("reads longitude first with a comma decimal mark", () => {
    expect(parsed(EuropeanWGS84Rparser, "30,5234 50,4501")).toEqual(kyiv);
  });

  it("rejects a comma as the value separator", () => {
    expect(errorOf(EuropeanWGS84Rparser, "30,5234, 50,4501")).toContain(
      "Expecting whitespace between the two values",
    );
  });

  it("applies the range limits in reversed order", () => {
    expect(errorOf(EuropeanWGS84Rparser, "181,0 50,0")).toBe(
      "longitude must be between -180 and 180, but got 181",
    );
  });
});

describe("coordinateParser", () => {
  it.each([
    ["50.4501, 30.5234", "WGS84", kyiv],
    ["50,4501 30,5234", "WGS84", kyiv],
    ["151.2093, -33.8688", "WGS84R", { latitude: -33.8688, longitude: 151.2093 }],
    ["151,2093 -33,8688", "WGS84R", { latitude: -33.8688, longitude: 151.2093 }],
  ])("tags %j as %s", (input, system, expected) => {
    expect(parsed(coordinateParser, input)).toEqual({ ...expected, system });
  });

  it("prefers WGS84 when both orders are in range", () => {
    expect(parsed(coordinateParser, "50.4501 30.5234")).toEqual({ ...kyiv, system: "WGS84" });
  });

  it("falls back to WGS84R when latitude is out of range", () => {
    expect(parsed(coordinateParser, "151.2093 -33.8688")).toEqual({
      latitude: -33.8688,
      longitude: 151.2093,
      system: "WGS84R",
    });
  });
});
