import { describe, expect, it } from "vitest";
import type { Coordinates } from "../parsers/commonParsers.ts";
import { coordinateParser } from "../parsers/coordinateParser.ts";
import { USNGparser } from "../parsers/USNGparser.ts";
import { WGS84Rparser } from "../parsers/WGS84Rparser.ts";
import {
  CONVERTIBLE_SYSTEMS,
  type SystemCoordinate,
  fromWGS84,
  toAllSystems,
  toWGS84,
} from "./coordinateConverter.ts";

const parse = (input: string): SystemCoordinate => {
  const result = coordinateParser.run(input);
  if (result.isError) throw new Error(`expected "${input}" to parse, but got: ${result.error}`);
  return result.result;
};

const kyiv: Coordinates = { latitude: 50.4501, longitude: 30.5234 };

describe("formatting the notations that are only a spelling of WGS 84", () => {
  it.each([
    ["WGS84", "50.4501, 30.5234"],
    ["WGS84R", "30.5234, 50.4501"],
    ["DD", "50.4501°N, 30.5234°E"],
    ["DDM", "50° 27.006'N, 30° 31.404'E"],
    ["DMS", `50° 27' 0.36"N, 30° 31' 24.24"E`],
  ] as const)("writes Kyiv in %s as %s", (system, expected) => {
    expect(fromWGS84(kyiv, system)).toBe(expected);
  });

  it("gives the southern and western hemispheres their letters", () => {
    expect(fromWGS84({ latitude: -33.8688, longitude: -70.6693 }, "DD")).toBe(
      "33.8688°S, 70.6693°W",
    );
  });

  it("carries a rounded-up second into the minute", () => {
    // 0.9999999° is 59' 59.99964", which rounds to 60" — it must print as a whole degree.
    expect(fromWGS84({ latitude: 0.9999999, longitude: 0 }, "DMS")).toBe(`1° 0' 0"N, 0° 0' 0"E`);
  });
});

describe("to WGS 84", () => {
  it.each([
    ["50.4501, 30.5234", kyiv],
    ["30.5234 50.4501", { latitude: 30.5234, longitude: 50.4501 }],
    ["151.2093, -33.8688", { latitude: -33.8688, longitude: 151.2093 }],
    ["50.4501°N, 30.5234°E", kyiv],
    ["50° 27.006'N, 30° 31.404'E", kyiv],
    [`50° 27' 0.36"N, 30° 31' 24.24"E`, kyiv],
  ])("reads %s", (input, expected) => {
    expect(toWGS84(parse(input))).toEqual(expected);
  });

  it("accepts a USNG reference, which coordinateParser reports as MGRS", () => {
    const usng = USNGparser.run("18T WL 83959 07350");
    if (usng.isError) throw new Error(usng.error);
    expect(toWGS84({ ...usng.result, system: "USNG" })).toEqual(toWGS84(parse("18TWL8395907350")));
  });
});

describe("round trip through every system", () => {
  const points: [string, Coordinates][] = [
    ["Kyiv", kyiv],
    ["Lviv", { latitude: 49.8397, longitude: 24.0297 }],
    ["Kharkiv", { latitude: 49.9935, longitude: 36.2304 }],
  ];

  // Every system rounds or truncates to the metre, so a round trip comes back within one: 1e-5° is
  // about 1.1 m of latitude, and less than that of longitude this far north.
  //
  // WGS84R is left to its own parser: coordinateParser tries latitude first, and every Ukrainian
  // longitude is also a valid latitude, so "30.5234, 50.4501" reads as WGS84 there.
  describe.each(points)("%s", (_, coords) => {
    it.each(CONVERTIBLE_SYSTEMS.filter((system) => system !== "WGS84R"))(
      "survives %s",
      (system) => {
        const back = toWGS84(parse(fromWGS84(coords, system)));
        expect(Math.abs(back.latitude - coords.latitude)).toBeLessThan(1e-5);
        expect(Math.abs(back.longitude - coords.longitude)).toBeLessThan(1e-5);
      },
    );

    it("survives WGS84R, read by WGS84Rparser", () => {
      expect(WGS84Rparser.run(fromWGS84(coords, "WGS84R"))).toMatchObject({
        isError: false,
        result: coords,
      });
    });
  });
});

describe("every system at once", () => {
  it("reports why a system cannot express the point instead of failing the rest", () => {
    const conversions = toAllSystems({ latitude: 52.52, longitude: 13.405 });
    expect(conversions.find(({ system }) => system === "UCS-2000")).toHaveProperty("error");
    expect(conversions.find(({ system }) => system === "MGRS")).toEqual({
      system: "MGRS",
      value: "33UUU9177920072",
    });
  });
});
