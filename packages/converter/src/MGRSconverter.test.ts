import { describe, expect, it } from "vitest";
import type { Coordinates } from "./coordinates.ts";
import { usngParser, mgrsParser } from "@coordinate-parser/parser";
import { formatMGRS, formatUSNG, fromMGRS, toMGRS, toUSNG } from "./MGRSconverter.ts";

// Reference strings computed with the `mgrs` Python package 1.5, which wraps NGA's GEOTRANS.

const references: { name: string; coords: Coordinates; metre: string; kilometre: string }[] = [
  {
    name: "Kyiv",
    coords: { latitude: 50.4501, longitude: 30.5234 },
    metre: "36UUA2418291607",
    kilometre: "36UUA2491",
  },
  {
    name: "the Eiffel Tower",
    coords: { latitude: 48.8582, longitude: 2.2945 },
    metre: "31UDQ4825111932",
    kilometre: "31UDQ4811",
  },
  {
    name: "Sydney",
    coords: { latitude: -33.8688, longitude: 151.2093 },
    metre: "56HLH3436850948",
    kilometre: "56HLH3450",
  },
  {
    name: "New York",
    coords: { latitude: 40.7128, longitude: -74.006 },
    metre: "18TWL8395907350",
    kilometre: "18TWL8307",
  },
  {
    name: "Quito",
    coords: { latitude: -0.1807, longitude: -78.4678 },
    metre: "17MQV8186180007",
    kilometre: "17MQV8180",
  },
  {
    name: "Bergen",
    coords: { latitude: 60.3913, longitude: 5.3221 },
    metre: "32VKN9735300648",
    kilometre: "32VKN9700",
  },
  {
    name: "Longyearbyen",
    coords: { latitude: 78.2232, longitude: 15.6267 },
    metre: "33XWG1427883355",
    kilometre: "33XWG1483",
  },
  {
    name: "Cape Horn",
    coords: { latitude: -55.98, longitude: -67.27 },
    metre: "19FFT0794594795",
    kilometre: "19FFT0794",
  },
];

const parse = (input: string) => {
  const result = mgrsParser.run(input);
  if (result.isError) throw new Error(result.error);
  return result.result.coordinate;
};

describe("WGS 84 to MGRS", () => {
  it.each(references)("matches GEOTRANS for $name at 1 m", ({ coords, metre }) => {
    expect(formatMGRS(toMGRS(coords))).toBe(metre);
  });

  it.each(references)("matches GEOTRANS for $name at 1 km", ({ coords, kilometre }) => {
    expect(formatMGRS(toMGRS(coords, 1000))).toBe(kilometre);
  });

  it("truncates rather than rounds, so the square always contains the point", () => {
    // Kyiv's UTM northing is 5591607.6: rounding would give ...608, the square to the north.
    expect(toMGRS({ latitude: 50.4501, longitude: 30.5234 }).northing).toBe(91607);
  });

  it("can name a bare 100 km square", () => {
    expect(formatMGRS(toMGRS({ latitude: 50.4501, longitude: 30.5234 }, 100000))).toBe("36UUA");
  });
});

describe("WGS 84 to USNG", () => {
  it("writes the grid with spaces, as FGDC-STD-011-2001 prescribes", () => {
    expect(formatUSNG(toUSNG({ latitude: 40.7128, longitude: -74.006 }))).toBe(
      "18T WL 83959 07350",
    );
  });

  it("parses back with usngParser", () => {
    const written = formatUSNG(toUSNG({ latitude: 40.7128, longitude: -74.006 }, 10000));
    expect(written).toBe("18T WL 8 0");
    expect(usngParser.run(written).isError).toBe(false);
  });
});

describe("MGRS to WGS 84", () => {
  it.each(references)("lands within a metre of $name", ({ coords, metre }) => {
    const result = fromMGRS(parse(metre));
    // The centre of a 1 m square is at most 0.7 m from any point in it; 1e-5° is about 1.1 m.
    expect(Math.abs(result.latitude - coords.latitude)).toBeLessThan(1e-5);
    expect(Math.abs(result.longitude - coords.longitude)).toBeLessThan(1e-5);
  });

  it("returns the centre of a coarse square, not its corner", () => {
    // 36UUA2491 is the 1 km square from 324000E 5591000N; PROJ puts 324500E 5591500N here.
    expect(fromMGRS(parse("36UUA2491"))).toEqual({ latitude: 50.4492283, longitude: 30.5279224 });
  });

  it("matches PROJ for the NGA.STND.0037 example, half a metre in from the corner", () => {
    // GEOTRANS returns the south-west corner, 21.4097967 -157.9160812; this is 612345.5E 2367890.5N.
    expect(fromMGRS(parse("4QFJ1234567890"))).toEqual({
      latitude: 21.4098012,
      longitude: -157.9160763,
    });
  });

  it("uses the latitude band to pick the 2000 km cycle of the row letter", () => {
    expect(fromMGRS(parse("31U DQ 48251 11932")).latitude).toBeCloseTo(48.8582, 4);
  });

  it("rejects a square whose row letter does not occur in the band", () => {
    // Row Q recurs every 2000 km; band F, 56-48°S, falls between two of its repetitions.
    expect(() => fromMGRS(parse("31F DQ 48251 11932"))).toThrow(
      "MGRS square DQ has no part in band F of zone 31, which spans -56° to -48°",
    );
  });

  it("rejects a column letter the zone does not use", () => {
    // Zone 36 takes its columns from S-Z; A belongs to zones 1, 4, 7...
    expect(() => fromMGRS(parse("36UAA2418291607"))).toThrow(
      "MGRS column letter A is not used in zone 36, whose columns are STUVWXYZ",
    );
  });
});
