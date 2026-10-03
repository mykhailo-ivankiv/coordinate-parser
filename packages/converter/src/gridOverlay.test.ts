import { describe, expect, it } from "vitest";
import { gridZones, mgrsGrid, spacingFor, zoneSeams } from "./gridOverlay.ts";
import { project } from "./transverseMercator.ts";
import { utmProjection } from "./UTMconverter.ts";

describe("UTM grid zones", () => {
  const zones = gridZones();
  const find = (designator: string) => zones.find((zone) => zone.designator === designator);

  it("lists 60 zones by 20 bands, less the three Svalbard does without", () => {
    expect(zones).toHaveLength(60 * 20 - 3);
    expect(find("32X")).toBeUndefined();
  });

  it("boxes Kyiv's zone by its meridians and band", () => {
    expect(find("36U")).toEqual({ designator: "36U", west: 30, south: 48, east: 36, north: 56 });
  });

  it("widens 32V over south-west Norway and runs band X on to 84°N", () => {
    expect(find("32V")).toMatchObject({ west: 3, east: 12 });
    expect(find("31V")).toMatchObject({ west: 0, east: 3 });
    expect(find("33X")).toMatchObject({ west: 9, east: 21, south: 72, north: 84 });
  });
});

describe("grid spacing", () => {
  it("picks the finest spacing whose cells stay at least 120 px across", () => {
    expect(spacingFor(2000)).toBe(100_000);
    expect(spacingFor(100)).toBe(100_000);
    expect(spacingFor(50)).toBe(10_000);
    expect(spacingFor(5)).toBe(1_000);
    expect(spacingFor(0.05)).toBe(10);
  });
});

describe("MGRS grid", () => {
  const kyiv = { west: 29.5, south: 49.8, east: 31.5, north: 51 };

  it("draws lines on whole 100 km eastings and northings of zone 36", () => {
    const grid = mgrsGrid(kyiv, 100_000);
    if (grid === null) throw new Error("expected a grid");
    expect(grid.lines.length).toBeGreaterThan(0);

    for (const { path } of grid.lines) {
      const projected = path.map((point) => project(point, utmProjection(36, "N")));
      const onEasting = projected.every(
        ({ easting }) => Math.abs(easting / 100_000 - Math.round(easting / 100_000)) < 1e-6,
      );
      const onNorthing = projected.every(
        ({ northing }) => Math.abs(northing / 100_000 - Math.round(northing / 100_000)) < 1e-6,
      );
      // West of 30°E the lines belong to zone 35, so only check those in 36.
      if (path.every(({ longitude }) => longitude >= 30))
        expect(onEasting || onNorthing).toBe(true);
    }
  });

  it("names the 100 km squares, Kyiv's among them", () => {
    const grid = mgrsGrid(kyiv, 100_000);
    expect(
      grid?.labels.map(({ reference }) => `${reference.zone}${reference.band} ${reference.square}`),
    ).toContain("36U UA");
  });

  it("stops each line at its zone edge", () => {
    const grid = mgrsGrid(kyiv, 100_000);
    for (const { path } of grid?.lines ?? []) {
      const sides = new Set(path.map(({ longitude }) => longitude >= 30));
      expect(sides.size).toBe(1);
    }
  });

  it("refuses a view that would need too many lines", () => {
    expect(mgrsGrid({ west: -180, south: -80, east: 180, north: 84 }, 1_000)).toBeNull();
  });
});

describe("the seam between zones", () => {
  // Kyiv lies half a degree east of 30°E, the edge between zones 35 and 36.
  const kyiv = { west: 27, south: 48.5, east: 34, north: 52.5 };

  it("carries the lines of both zones right up to the zone edge", () => {
    const grid = mgrsGrid(kyiv, 100_000);
    const ends = (grid?.lines ?? []).flatMap(({ path }) => [path[0], path[path.length - 1]]);
    const nearest = (side: (longitude: number) => boolean) =>
      Math.min(
        ...ends
          .filter(({ longitude }) => side(longitude))
          .map(({ longitude }) => Math.abs(longitude - 30)),
      );
    // Within a millimetre or so of the meridian, from either side.
    expect(nearest((longitude) => longitude <= 30)).toBeLessThan(1e-7);
    expect(nearest((longitude) => longitude >= 30)).toBeLessThan(1e-7);
  });

  it("lists each zone edge once, Norway's 3°E among them", () => {
    const seams = zoneSeams();
    const keys = seams.map(([from, to]) => `${from.longitude}:${from.latitude}:${to.latitude}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("3:56:64");
    expect(keys).toContain("30:48:56");
  });
});

describe("cell labels", () => {
  it("names each finer cell by its reference at the grid's precision", () => {
    const view = { west: 30.3, south: 50.35, east: 30.75, north: 50.55 };
    const tenKilometres = mgrsGrid(view, 10_000)?.labels.map(({ reference }) => reference) ?? [];
    // Kyiv, 36UUA2418291607, lies in the 10 km cell UA 2 9.
    expect(tenKilometres).toContainEqual({
      system: "MGRS",
      zone: 36,
      band: "U",
      square: "UA",
      easting: 20000,
      northing: 90000,
      precision: 10000,
    });

    const oneKilometre =
      mgrsGrid({ west: 30.5, south: 50.44, east: 30.55, north: 50.46 }, 1_000)?.labels.map(
        ({ reference }) => reference,
      ) ?? [];
    expect(oneKilometre).toContainEqual(
      expect.objectContaining({ square: "UA", easting: 24000, northing: 91000, precision: 1000 }),
    );
  });
});
