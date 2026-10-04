import { formatUcs2000 } from "@coordinate-parser/formatter";
import { describe, expect, it } from "vitest";
import type { Coordinates } from "./coordinates.ts";
import { ucs2000Parser } from "@coordinate-parser/parser";
import { project } from "./transverseMercator.ts";
import { fromUcs2000ToWgs84, fromUcs2000ToWgs84Square, fromWgs84ToUcs2000 } from "./ucs2000.ts";
import { WGS84_ELLIPSOID } from "./ellipsoid.ts";

// Reference values computed with PROJ 9.3 (pyproj 3.6), EPSG:4326 to EPSG:5562-5565. PROJ chooses
// EPSG:5840 for the datum shift, the same transformation the converter uses.

const references: { name: string; coords: Coordinates; zone: number; x: number; y: number }[] = [
  {
    name: "Kyiv",
    coords: { latitude: 50.4501, longitude: 30.5234 },
    zone: 6,
    x: 5593953.8799,
    y: 324225.8041,
  },
  {
    name: "Lviv",
    coords: { latitude: 49.8397, longitude: 24.0297 },
    zone: 5,
    x: 5527369.2137,
    y: 286468.5952,
  },
  {
    name: "Uzhhorod",
    coords: { latitude: 48.6208, longitude: 22.2879 },
    zone: 4,
    x: 5388385.741,
    y: 595072.4092,
  },
  {
    name: "Kharkiv",
    coords: { latitude: 49.9935, longitude: 36.2304 },
    zone: 7,
    x: 5543901.2928,
    y: 301526.7143,
  },
  {
    name: "Luhansk",
    coords: { latitude: 48.574, longitude: 39.3078 },
    zone: 7,
    x: 5382398.9982,
    y: 522822.9033,
  },
  {
    name: "Odesa",
    coords: { latitude: 46.4825, longitude: 30.7233 },
    zone: 6,
    x: 5152345.2644,
    y: 325294.7909,
  },
];

describe("WGS 84 to UCS-2000", () => {
  it.each(references)("matches PROJ for $name to the metre", ({ coords, zone, x, y }) => {
    expect(fromWgs84ToUcs2000({ system: "WGS84", ...coords })).toEqual({
      system: "UCS-2000",
      zone,
      northing: Math.round(x),
      easting: Math.round(y),
    });
  });

  it("applies the datum shift, not just the projection", () => {
    // Projecting WGS 84 straight onto the Gauss-Kruger zone lands about 160 m off in Kyiv: 109 m in
    // X, 114 m in Y — plausible on a map, and wrong.
    const naive = project(
      { latitude: 50.4501, longitude: 30.5234 },
      {
        ellipsoid: WGS84_ELLIPSOID,
        centralMeridian: 33,
        scale: 1,
        falseEasting: 500000,
        falseNorthing: 0,
      },
    );
    const { northing } = fromWgs84ToUcs2000({
      system: "WGS84",
      latitude: 50.4501,
      longitude: 30.5234,
    });
    expect(Math.abs(naive.northing - northing)).toBeGreaterThan(100);
  });

  it("formats the way the UCS-2000 parser reads", () => {
    const written = formatUcs2000(
      fromWgs84ToUcs2000({ system: "WGS84", latitude: 50.4501, longitude: 30.5234 }),
    );
    expect(written).toBe("5593954 6324226");
    expect(ucs2000Parser.run(written)).toMatchObject({
      isError: false,
      result: [{ system: "UCS-2000", zone: 6, northing: 5593954, easting: 324226 }],
    });
  });

  it("rejects points outside zones 4-7", () => {
    expect(() =>
      fromWgs84ToUcs2000({ system: "WGS84", latitude: 52.52, longitude: 13.405 }),
    ).toThrow(
      "UCS-2000 is defined in zones 4-7, longitudes 18°E to 42°E, but 13.405° falls in zone 3",
    );
  });
});

describe("UCS-2000 to WGS 84", () => {
  it.each(references)("inverts $name back to within a centimetre", ({ coords, zone, x, y }) => {
    const result = fromUcs2000ToWgs84({ system: "UCS-2000", zone, northing: x, easting: y });
    expect(result.latitude).toBeCloseTo(coords.latitude, 6);
    expect(result.longitude).toBeCloseTo(coords.longitude, 6);
  });

  it("matches PROJ for the example in the app", () => {
    // EPSG:5564 → EPSG:4326 on "5591000 6325000": 50.4238014, 30.5356689.
    expect(
      fromUcs2000ToWgs84({ system: "UCS-2000", zone: 6, northing: 5591000, easting: 325000 }),
    ).toEqual({
      system: "WGS84",
      latitude: 50.4238014,
      longitude: 30.5356689,
    });
  });
});

describe("the square a UCS-2000 position names", () => {
  it("shifts every corner through the datum, matching PROJ", () => {
    // EPSG:5564 → EPSG:4326 on the corners of 5593954 6324226, half a metre either side.
    const { southWest, northEast } = fromUcs2000ToWgs84Square({
      system: "UCS-2000",
      zone: 6,
      northing: 5593954,
      easting: 324226,
    });
    expect(southWest).toEqual({ system: "WGS84", latitude: 50.4500965, longitude: 30.5233959 });
    expect(northEast).toEqual({ system: "WGS84", latitude: 50.4501058, longitude: 30.5234095 });
  });
});
