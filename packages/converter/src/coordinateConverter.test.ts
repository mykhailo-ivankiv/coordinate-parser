import { describe, expect, it } from "vitest";
import {
  type Coordinates,
  coordinateParser,
  ddmParser,
  ddParser,
  dmsParser,
  mgrsParser,
  type SystemCoordinate,
  ucs2000Parser,
  usngParser,
  utmParser,
  wgs84Parser,
  wgs84rParser,
} from "@coordinate-parser/parser";
import { project } from "./transverseMercator.ts";
import { utmProjection } from "./UTMconverter.ts";
import {
  areaOf,
  CONVERTIBLE_SYSTEMS,
  GRID_SYSTEMS,
  LATITUDE_LONGITUDE_NOTATIONS,
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
    expect(fromWGS84(kyiv, system).value).toBe(expected);
  });

  it("gives the southern and western hemispheres their letters", () => {
    expect(fromWGS84({ latitude: -33.8688, longitude: -70.6693 }, "DD").value).toBe(
      "33.8688°S, 70.6693°W",
    );
  });

  it("carries a rounded-up second into the minute", () => {
    // 0.9999999° is 59' 59.99964", which rounds to 60" — it must print as a whole degree.
    expect(fromWGS84({ latitude: 0.9999999, longitude: 0 }, "DMS").value).toBe(
      `1° 0' 0"N, 0° 0' 0"E`,
    );
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
    const usng = usngParser.run("18T WL 83959 07350");
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
        const back = toWGS84(parse(fromWGS84(coords, system).value));
        expect(Math.abs(back.latitude - coords.latitude)).toBeLessThan(1e-5);
        expect(Math.abs(back.longitude - coords.longitude)).toBeLessThan(1e-5);
      },
    );

    it("survives WGS84R, read by wgs84rParser", () => {
      expect(wgs84rParser.run(fromWGS84(coords, "WGS84R").value)).toMatchObject({
        isError: false,
        result: coords,
      });
    });
  });
});

describe("reading back with the system's own parser", () => {
  // Unlike coordinateParser, the per-system parsers reach USNG and WGS84R too, so every system round-trips.
  it.each([
    ["WGS84", wgs84Parser],
    ["WGS84R", wgs84rParser],
    ["DD", ddParser],
    ["DDM", ddmParser],
    ["DMS", dmsParser],
    ["MGRS", mgrsParser],
    ["USNG", usngParser],
    ["UTM", utmParser],
    ["UCS-2000", ucs2000Parser],
  ] as const)("reads %s back as itself", (system, parser) => {
    const result = parser.run(fromWGS84(kyiv, system).value);
    if (result.isError) throw new Error(result.error);
    expect(result.result.system).toBe(system);
    const back = toWGS84(result.result);
    expect(Math.abs(back.latitude - kyiv.latitude)).toBeLessThan(1e-5);
    expect(Math.abs(back.longitude - kyiv.longitude)).toBeLessThan(1e-5);
  });
});

describe("every system at once", () => {
  it("reports why a system cannot express the point instead of failing the rest", () => {
    const conversions = toAllSystems({ latitude: 52.52, longitude: 13.405 });
    expect(conversions.find(({ system }) => system === "UCS-2000")).toHaveProperty("error");
    expect(conversions.find(({ system }) => system === "MGRS")).toMatchObject({
      system: "MGRS",
      value: "33UUU9177920072",
    });
  });
});

describe("the area a value designates", () => {
  // Corner references computed with PROJ 9.3: EPSG:32636 and EPSG:5564 to EPSG:4326.
  const kyivCorners = {
    southWest: { latitude: 50.4445861, longitude: 30.5211213 },
    southEast: { latitude: 50.4448851, longitude: 30.535192 },
    northEast: { latitude: 50.4538701, longitude: 30.5347249 },
    northWest: { latitude: 50.453571, longitude: 30.5206516 },
  };
  const kyivKilometre = {
    centre: { latitude: 50.4492283, longitude: 30.5279224 },
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

  it("gives a latitude/longitude notation a point and no corners", () => {
    expect(fromWGS84(kyiv, "DMS").area).toEqual({
      centre: kyiv,
      corners: null,
      outline: null,
      size: 0,
    });
  });

  it("gives an MGRS reference the square it names, matching PROJ at every corner", () => {
    expect(areaOf(parse("36UUA2491"))).toEqual(kyivKilometre);
  });

  it("names, from WGS 84, the square at the requested precision", () => {
    const converted = fromWGS84(kyiv, "MGRS", { precision: 1000 });
    expect(converted.value).toBe("36UUA2491");
    expect(converted.area).toEqual(kyivKilometre);
  });

  it("puts the point inside the square it converts to", () => {
    const { corners } = fromWGS84(kyiv, "USNG", { precision: 10000 }).area;
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
    expect(corners?.southWest).toEqual({ latitude: 50.4500965, longitude: 30.5233959 });
    expect(corners?.northEast).toEqual({ latitude: 50.4501058, longitude: 30.5234095 });
  });

  it("refuses a 100 km USNG square, which USNG cannot write", () => {
    expect(() => fromWGS84(kyiv, "USNG", { precision: 100000 })).toThrow(
      "USNG requires at least one digit per axis, so its coarsest square is 10 km",
    );
  });
});

describe("grouping", () => {
  it("splits every system into exactly one of the notations of WGS 84 or the grids", () => {
    expect([...LATITUDE_LONGITUDE_NOTATIONS, ...GRID_SYSTEMS].toSorted()).toEqual(
      [...CONVERTIBLE_SYSTEMS].toSorted(),
    );
  });

  it("gives every notation of WGS 84 the same point", () => {
    const areas = LATITUDE_LONGITUDE_NOTATIONS.map((system) => fromWGS84(kyiv, system).area);
    for (const area of areas)
      expect(area).toEqual({ centre: kyiv, corners: null, outline: null, size: 0 });
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
    expect(outline).toContainEqual({ latitude: 49.6339036, longitude: 30.9226471 });
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
    ["50.4501°N, 30.5234°E", ddParser],
    ["50° 27.006'N, 30° 31.404'E", ddmParser],
    [`50° 27' 0.36"N, 30° 31' 24.24"E`, dmsParser],
  ])("converts %s to the same point", (input, parser) => {
    const result = parser.run(input);
    if (result.isError) throw new Error(result.error);
    expect(toWGS84(result.result)).toEqual(kyiv);
  });
});
