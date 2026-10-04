import {
  coordinateParser,
  mgrsParser,
  ucs2000Parser,
  usngParser,
  utmParser,
  wgs84ddmParser,
  wgs84ddParser,
  wgs84dmsParser,
  wgs84Parser,
  wgs84rParser,
} from "@coordinate-toolkit/parser";
import type { WGS84Coordinate } from "@coordinate-toolkit/types";
import { describe, expect, it } from "vitest";
import {
  format,
  formatWgs84dd,
  formatWgs84ddm,
  formatWgs84dms,
  formatMgrs,
  formatUsng,
  formatUtm,
  formatWgs84,
} from "./format.ts";

const kyiv: WGS84Coordinate = { system: "WGS84", latitude: 50.4501, longitude: 30.5234 };

describe("WGS 84", () => {
  it.each([
    ["WGS84", "50.4501, 30.5234"],
    ["WGS84R", "30.5234, 50.4501"],
    ["DD", "50.4501°N, 30.5234°E"],
    ["DDM", "50° 27.006'N, 30° 31.404'E"],
    ["DMS", `50° 27' 0.36"N, 30° 31' 24.24"E`],
  ] as const)("writes Kyiv in %s as %s", (notation, expected) => {
    expect(format([kyiv, notation])).toBe(expected);
  });

  it("gives the southern and western hemispheres their letters", () => {
    const southWest: WGS84Coordinate = { system: "WGS84", latitude: -33.8688, longitude: -70.6693 };
    expect(formatWgs84dd(southWest)).toBe("33.8688°S, 70.6693°W");
  });

  it("carries rounded seconds and minutes into the next unit", () => {
    // 59.99999" rounds to 60.000", which must become a whole minute: 60" does not parse.
    const nearMinute: WGS84Coordinate = {
      system: "WGS84",
      latitude: 50 + 27 / 60 + 59.99999 / 3600,
      longitude: 30,
    };
    expect(formatWgs84dms(nearMinute)).toBe(`50° 28' 0"N, 30° 0' 0"E`);
    expect(formatWgs84ddm({ ...nearMinute, latitude: 50 + 59.999999 / 60 })).toBe(
      "51° 0'N, 30° 0'E",
    );
  });
});

describe("grids", () => {
  it("drops digits for a coarse MGRS square rather than padding them", () => {
    const square = { system: "MGRS", zone: 36, band: "U", square: "UA" } as const;
    expect(formatMgrs({ ...square, easting: 24000, northing: 91000, precision: 1000 })).toBe(
      "36UUA2491",
    );
    expect(formatMgrs({ ...square, easting: 0, northing: 0, precision: 100000 })).toBe("36UUA");
  });

  it("pads USNG digits with leading zeros", () => {
    expect(
      formatUsng({
        system: "USNG",
        zone: 10,
        band: "S",
        square: "GJ",
        easting: 6832,
        northing: 44683,
        precision: 1,
      }),
    ).toBe("10S GJ 06832 44683");
  });
});

// Each string here is in the form the formatter writes, so reading it and writing it back must give
// it unchanged; and the parser must read every string the formatter writes.
describe("round trip with the parser", () => {
  it.each([
    [wgs84Parser, "50.4501, 30.5234"],
    [wgs84rParser, "30.5234, 50.4501"],
    [wgs84ddParser, "33.8688°S, 151.2093°E"],
    [wgs84ddmParser, "50° 27.006'N, 30° 31.404'E"],
    [wgs84dmsParser, `50° 27' 0.36"N, 30° 31' 24.24"E`],
    [mgrsParser, "4QFJ1234567890"],
    [mgrsParser, "4QFJ"],
    [usngParser, "10S GJ 06832 44683"],
    [usngParser, "10S GJ 0 4"],
    [utmParser, "36U 324182 5591608"],
    [ucs2000Parser, "5593954 6324226"],
  ] as const)("writes back what it read: %#", (parser, text) => {
    const result = parser.run(text);
    if (result.isError) throw new Error(result.error);
    expect(format(result.result)).toBe(text);
  });

  it("writes a spaced or grouped input in the canonical form", () => {
    const canonical = (text: string) => {
      const result = coordinateParser.run(text);
      if (result.isError) throw new Error(result.error);
      return format(result.result);
    };
    expect(canonical("4Q FJ 12345 67890")).toBe("4QFJ1234567890");
    expect(canonical("55-91000 63-25000")).toBe("5591000 6325000");
    expect(canonical("50,4501 30,5234")).toBe("50.4501, 30.5234");
  });
});

describe("what cannot be written", () => {
  it("refuses a UTM position without a band rather than writing one that reads back elsewhere", () => {
    expect(() =>
      formatUtm({ system: "UTM", zone: 36, hemisphere: "S", easting: 324182, northing: 5591608 }),
    ).toThrow(RangeError);
  });

  it("writes a value that rounds to zero without a minus sign", () => {
    expect(formatWgs84({ system: "WGS84", latitude: -0.00000001, longitude: 30 })).toBe("0, 30");
  });
});
