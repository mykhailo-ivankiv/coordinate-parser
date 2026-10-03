import { format } from "@coordinate-parser/formatter";
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
} from "@coordinate-parser/parser";
import type { Coordinate, WGS84Coordinate } from "@coordinate-parser/types";
import { describe, expect, it } from "vitest";
import { areaOf, fromWGS84, toAllSystems, toWGS84 } from "./coordinateConverter.ts";
import { project } from "./transverseMercator.ts";
import { utmProjection } from "./UTMconverter.ts";

const parse = (input: string): Coordinate => {
  const result = coordinateParser.run(input);
  if (result.isError) throw new Error(`expected "${input}" to parse, but got: ${result.error}`);
  return result.result[0];
};

const wgs84 = (latitude: number, longitude: number): WGS84Coordinate => ({
  system: "WGS84",
  latitude,
  longitude,
});

const kyiv = wgs84(50.4501, 30.5234);

describe("to WGS 84", () => {
  it.each([
    ["50.4501, 30.5234", kyiv],
    ["30.5234 50.4501", wgs84(30.5234, 50.4501)],
    ["151.2093, -33.8688", wgs84(-33.8688, 151.2093)],
    ["50.4501°N, 30.5234°E", kyiv],
    ["50° 27.006'N, 30° 31.404'E", kyiv],
    [`50° 27' 0.36"N, 30° 31' 24.24"E`, kyiv],
  ])("reads %s", (input, expected) => {
    expect(toWGS84(parse(input))).toEqual(expected);
  });

  it("accepts a USNG reference, which coordinateParser reports as MGRS", () => {
    const usng = usngParser.run("18T WL 83959 07350");
    if (usng.isError) throw new Error(usng.error);
    expect(toWGS84(usng.result[0])).toEqual(toWGS84(parse("18TWL8395907350")));
  });
});

describe("from WGS 84", () => {
  it("gives the coordinate in each system as data", () => {
    expect(fromWGS84(kyiv, "WGS84")).toEqual(kyiv);
    expect(fromWGS84(kyiv, "MGRS")).toEqual({
      system: "MGRS",
      zone: 36,
      band: "U",
      square: "UA",
      easting: 24182,
      northing: 91607,
      precision: 1,
    });
    expect(fromWGS84(kyiv, "UTM")).toEqual({
      system: "UTM",
      zone: 36,
      band: "U",
      hemisphere: "N",
      easting: 324182,
      northing: 5591608,
    });
    expect(fromWGS84(kyiv, "UCS-2000")).toEqual({
      system: "UCS-2000",
      zone: 6,
      northing: 5593954,
      easting: 324226,
    });
  });

  it("names the square at the requested precision", () => {
    expect(fromWGS84(kyiv, "MGRS", { precision: 1000 })).toEqual({
      system: "MGRS",
      zone: 36,
      band: "U",
      square: "UA",
      easting: 24000,
      northing: 91000,
      precision: 1000,
    });
  });

  it("refuses a 100 km USNG square, which USNG cannot express", () => {
    expect(() => fromWGS84(kyiv, "USNG", { precision: 100000 })).toThrow(
      "USNG requires at least one digit per axis, so its coarsest square is 10 km",
    );
  });
});

describe("round trip through every system", () => {
  const points: [string, WGS84Coordinate][] = [
    ["Kyiv", kyiv],
    ["Lviv", wgs84(49.8397, 24.0297)],
    ["Kharkiv", wgs84(49.9935, 36.2304)],
  ];

  // Every system rounds or truncates to the metre, so a round trip comes back within one: 1e-5° is
  // about 1.1 m of latitude, and less than that of longitude this far north.
  describe.each(points)("%s", (_, point) => {
    it.each(["WGS84", "MGRS", "USNG", "UTM", "UCS-2000"] as const)("survives %s", (system) => {
      const back = toWGS84(fromWGS84(point, system));
      expect(Math.abs(back.latitude - point.latitude)).toBeLessThan(1e-5);
      expect(Math.abs(back.longitude - point.longitude)).toBeLessThan(1e-5);
    });
  });
});

describe("written by the formatter and read by the parser", () => {
  // Unlike coordinateParser, the per-system parsers reach USNG too, so every grid round-trips.
  it.each([
    ["MGRS", mgrsParser],
    ["USNG", usngParser],
    ["UTM", utmParser],
    ["UCS-2000", ucs2000Parser],
  ] as const)("reads %s back as itself", (system, parser) => {
    const result = parser.run(format([fromWGS84(kyiv, system)]));
    if (result.isError) throw new Error(result.error);
    expect(result.result[0]).toEqual(fromWGS84(kyiv, system));
  });
});

describe("every system at once", () => {
  it("reports why a system cannot express the point instead of failing the rest", () => {
    const results = toAllSystems(wgs84(52.52, 13.405));
    expect(results.map(({ system }) => system)).toEqual([
      "WGS84",
      "MGRS",
      "USNG",
      "UTM",
      "UCS-2000",
    ]);
    expect(results[4]).toHaveProperty("error");
    expect(results[1]).toMatchObject({ system: "MGRS", zone: 33, band: "U", square: "UU" });
  });
});

describe("the area a coordinate designates", () => {
  // Corner references computed with PROJ 9.3: EPSG:32636 and EPSG:5564 to EPSG:4326.
  const kyivCorners = {
    southWest: wgs84(50.4445861, 30.5211213),
    southEast: wgs84(50.4448851, 30.535192),
    northEast: wgs84(50.4538701, 30.5347249),
    northWest: wgs84(50.453571, 30.5206516),
  };
  const kyivKilometre = {
    centre: wgs84(50.4492283, 30.5279224),
    corners: kyivCorners,
    // Over 1 km an edge strays from a straight line by about 2 cm, so the outline is the corners.
    outline: [
      kyivCorners.southWest,
      kyivCorners.southEast,
      kyivCorners.northEast,
      kyivCorners.northWest,
      kyivCorners.southWest,
    ],
    size: 1000,
  };

  it("gives WGS 84 a point and no corners", () => {
    expect(areaOf(kyiv)).toEqual({ centre: kyiv, corners: null, outline: null, size: 0 });
  });

  it("gives an MGRS reference the square it names, matching PROJ at every corner", () => {
    expect(areaOf(parse("36UUA2491"))).toEqual(kyivKilometre);
  });

  it("gives a square converted from WGS 84 the same area as the one parsed", () => {
    expect(areaOf(fromWGS84(kyiv, "MGRS", { precision: 1000 }))).toEqual(kyivKilometre);
  });

  it("puts the point inside the square it converts to", () => {
    const { corners } = areaOf(fromWGS84(kyiv, "USNG", { precision: 10000 }));
    if (corners === null) throw new Error("expected a square");
    expect(kyiv.latitude).toBeGreaterThan(
      Math.max(corners.southWest.latitude, corners.southEast.latitude),
    );
    expect(kyiv.latitude).toBeLessThan(
      Math.min(corners.northWest.latitude, corners.northEast.latitude),
    );
    expect(kyiv.longitude).toBeGreaterThan(
      Math.max(corners.southWest.longitude, corners.northWest.longitude),
    );
    expect(kyiv.longitude).toBeLessThan(
      Math.min(corners.southEast.longitude, corners.northEast.longitude),
    );
  });

  it("leaves the stored centre where toWGS84 puts it", () => {
    const parsed = parse("36UUA2491");
    expect(toWGS84(parsed)).toEqual(areaOf(parsed).centre);
  });

  it("gives a UTM reference the metre square around its easting and northing", () => {
    const { size, corners } = areaOf(parse("36U 324182 5591608"));
    expect(size).toBe(1);
    expect(corners).not.toBeNull();
  });

  it("shifts every UCS-2000 corner through the datum, matching PROJ", () => {
    const { corners, size } = areaOf(parse("5593954 6324226"));
    expect(size).toBe(1);
    expect(corners?.southWest).toEqual(wgs84(50.4500965, 30.5233959));
    expect(corners?.northEast).toEqual(wgs84(50.4501058, 30.5234095));
  });
});

describe("the outline of a large square", () => {
  // 36UUA is the 100 km square from 300000E 5500000N in zone 36, south-west of Kyiv. Its southern
  // edge bows some 230 m away from the straight line between its corners on a web map.
  const outline = areaOf(parse("36UUA")).outline ?? [];

  it("follows the curved edges with extra points", () => {
    expect(outline.length).toBeGreaterThan(5);
  });

  it("closes the ring on the south-west corner", () => {
    expect(outline.at(-1)).toEqual(outline[0]);
  });

  it("puts every point on the square's edge, not on a chord", () => {
    for (const vertex of outline) {
      const { easting, northing } = project(vertex, utmProjection(36, "N"));
      const onEdge = [
        easting - 300000,
        easting - 400000,
        northing - 5500000,
        northing - 5600000,
      ].some((offset) => Math.abs(offset) < 0.02);
      expect(onEdge).toBe(true);
    }
  });

  it("passes through the middle of the southern edge where PROJ puts it", () => {
    // EPSG:32636 → EPSG:4326 on 350000E 5500000N.
    expect(outline).toContainEqual(wgs84(49.6339036, 30.9226471));
  });

  it("gives a 10 km square only the few points its gentler curve needs", () => {
    const tenKilometres = areaOf(parse("36UUA20")).outline ?? [];
    expect(tenKilometres.length).toBeGreaterThan(5);
    expect(tenKilometres.length).toBeLessThan(outline.length);
  });
});

describe("WGS 84 in any latitude-first notation", () => {
  it.each([
    ["50.4501, 30.5234", wgs84Parser],
    ["50,4501 30,5234", wgs84Parser],
    ["50.4501°N, 30.5234°E", wgs84ddParser],
    ["50° 27.006'N, 30° 31.404'E", wgs84ddmParser],
    [`50° 27' 0.36"N, 30° 31' 24.24"E`, wgs84dmsParser],
  ])("converts %s to the same point", (input, parser) => {
    const result = parser.run(input);
    if (result.isError) throw new Error(result.error);
    expect(toWGS84(result.result[0])).toEqual(kyiv);
  });
});
