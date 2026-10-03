import { describe, expect, it } from "vitest";
import type { Coordinates } from "../parsers/commonParsers.ts";
import { formatUTM, fromUTM, projectToUTM, toUTM } from "./UTMconverter.ts";

// Reference values computed with PROJ 9.3 (pyproj 3.6), WGS 84 to EPSG:326xx / EPSG:327xx.

type Reference = {
  name: string;
  coords: Coordinates;
  zone: number;
  band: string;
  easting: number;
  northing: number;
};

const references: Reference[] = [
  {
    name: "Kyiv",
    coords: { latitude: 50.4501, longitude: 30.5234 },
    zone: 36,
    band: "U",
    easting: 324182.2094,
    northing: 5591607.6074,
  },
  {
    name: "Sydney",
    coords: { latitude: -33.8688, longitude: 151.2093 },
    zone: 56,
    band: "H",
    easting: 334368.6336,
    northing: 6250948.3454,
  },
  {
    name: "New York",
    coords: { latitude: 40.7128, longitude: -74.006 },
    zone: 18,
    band: "T",
    easting: 583959.3723,
    northing: 4507350.9982,
  },
  {
    name: "Quito, just south of the equator",
    coords: { latitude: -0.1807, longitude: -78.4678 },
    zone: 17,
    band: "M",
    easting: 781861.4575,
    northing: 9980007.5669,
  },
  {
    name: "Bergen, in the widened zone 32V",
    coords: { latitude: 60.3913, longitude: 5.3221 },
    zone: 32,
    band: "V",
    easting: 297353.9327,
    northing: 6700648.3452,
  },
  {
    name: "Longyearbyen, in Svalbard's zone 33X",
    coords: { latitude: 78.2232, longitude: 15.6267 },
    zone: 33,
    band: "X",
    easting: 514278.7151,
    northing: 8683355.4695,
  },
];

describe("WGS 84 to UTM", () => {
  it.each(references)(
    "matches PROJ for $name to the millimetre",
    ({ coords, zone, band, easting, northing }) => {
      const projected = projectToUTM(coords);
      expect(projected).toMatchObject({ zone, band });
      expect(projected.easting).toBeCloseTo(easting, 3);
      expect(projected.northing).toBeCloseTo(northing, 3);
    },
  );

  it("rounds to the whole metre and reads the band as the hemisphere", () => {
    expect(toUTM({ latitude: 50.4501, longitude: 30.5234 })).toEqual({
      zone: 36,
      band: "U",
      hemisphere: "N",
      easting: 324182,
      northing: 5591608,
    });
    expect(toUTM({ latitude: -33.8688, longitude: 151.2093 }).hemisphere).toBe("S");
  });

  it("formats the way UTMparser reads", () => {
    expect(formatUTM(toUTM({ latitude: 50.4501, longitude: 30.5234 }))).toBe("36U 324182 5591608");
  });

  it("puts the antimeridian in zone 1, not a zone 61", () => {
    expect(toUTM({ latitude: 0, longitude: 180 }).zone).toBe(1);
  });

  it("rejects the polar caps, which belong to UPS", () => {
    expect(() => toUTM({ latitude: 84.5, longitude: 0 })).toThrow(RangeError);
    expect(() => toUTM({ latitude: -80.5, longitude: 0 })).toThrow(RangeError);
  });
});

describe("UTM to WGS 84", () => {
  it.each(references)(
    "inverts $name back to the input",
    ({ coords, zone, band, easting, northing }) => {
      const hemisphere = coords.latitude < 0 ? "S" : "N";
      const result = fromUTM({ zone, band, hemisphere, easting, northing });
      expect(result.latitude).toBeCloseTo(coords.latitude, 7);
      expect(result.longitude).toBeCloseTo(coords.longitude, 7);
    },
  );

  it("matches PROJ for a reference without a band", () => {
    expect(fromUTM({ zone: 17, hemisphere: "N", easting: 630084, northing: 4833438 })).toEqual({
      latitude: 43.6425618,
      longitude: -79.3871429,
    });
  });

  it("rejects a band the northing contradicts", () => {
    // Band M is 8°S to the equator; this northing sits near 46.6°S.
    expect(() =>
      fromUTM({ zone: 17, band: "M", hemisphere: "S", easting: 630084, northing: 4833438 }),
    ).toThrow("UTM band M spans -8° to 0°, but northing 4833438 lies at -46.6400°");
  });

  it("tolerates a reference rounded across a band edge", () => {
    // 48°N exactly is the T/U boundary; the rounded northing lands a hair north of it.
    const { easting, northing } = toUTM({ latitude: 47.9999999, longitude: -81 });
    expect(() =>
      fromUTM({ zone: 17, band: "T", hemisphere: "N", easting, northing }),
    ).not.toThrow();
  });
});

describe("the antimeridian", () => {
  it("brings a point just west of it in zone 1 back as a longitude, not past -180°", () => {
    // 1C 436707 1217049 lies a hair across the antimeridian from zone 1's side; its longitude is
    // 179.9999968°, which unwrapped arithmetic would give as -180.0000032°.
    const { longitude } = fromUTM({
      zone: 1,
      band: "C",
      hemisphere: "S",
      easting: 436707,
      northing: 1217049,
    });
    expect(longitude).toBeCloseTo(179.9999968, 7);
  });
});
