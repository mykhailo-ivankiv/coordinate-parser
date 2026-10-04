import { fromUtmToWgs84, fromWgs84ToMgrs, fromWgs84ToUtm } from "@coordinate-parser/converter";
import type { MGRSCoordinate, WGS84Coordinate } from "@coordinate-parser/types";

// The geometry of the UTM and MGRS grids, for drawing over a map.
//
//   * The UTM grid zones — a zone number and a latitude band, "36U" — are bounded by meridians and
//     parallels, so each is a plain box, and there are few enough to list them all.
//   * The MGRS grid is lines of constant easting and northing inside each zone: curves on a web map,
//     and far too many to draw for the whole world, so they are worked out for the view at hand.

/** A latitude/longitude box, in degrees. */
export type Box = { west: number; south: number; east: number; north: number };

/** A UTM grid zone and its box: `designator` is the zone number and band, "36U". */
type GridZone = Box & { designator: string };

// The UTM latitude bands, south to north, I and O skipped, and the latitudes UTM covers; past them the
// polar UPS grid takes over.
export const LATITUDE_BANDS = "CDEFGHJKLMNPQRSTUVWX";
const UTM_SOUTH_LIMIT = -80;
const UTM_NORTH_LIMIT = 84;

// Bands are 8° from 80°S, except X, which runs 72°N to 84°N.
const bandLimits = (band: string): [number, number] => {
  const south = UTM_SOUTH_LIMIT + LATITUDE_BANDS.indexOf(band) * 8;
  return [south, band === "X" ? UTM_NORTH_LIMIT : south + 8];
};

const ZONE_WIDTH = 6;

const zoneWest = (zone: number) => -180 + (zone - 1) * ZONE_WIDTH;

// NGA.STND.0037 moves zone edges in two places so that no country is split needlessly: around
// south-west Norway, band V, zone 32 widens westwards to 3°E; around Svalbard, band X, zones 31, 33,
// 35 and 37 widen to take in the even zones between them, which do not exist there.
const SPECIAL_ZONES: Record<string, Record<number, [number, number] | null>> = {
  V: { 31: [0, 3], 32: [3, 12] },
  X: { 31: [0, 9], 32: null, 33: [9, 21], 34: null, 35: [21, 33], 36: null, 37: [33, 42] },
};

/**
 * Every UTM grid zone: 60 zones by 20 latitude bands, less the three Svalbard does without.
 *
 * @returns The zones with their boxes, the Norway and Svalbard exceptions applied.
 */
export const gridZones = (): GridZone[] =>
  [...LATITUDE_BANDS].flatMap((band) => {
    const [south, north] = bandLimits(band);
    return Array.from({ length: 60 }, (_, index) => index + 1).flatMap((zone): GridZone[] => {
      const special = SPECIAL_ZONES[band]?.[zone];
      if (special === null) return [];
      const [west, east] = special ?? [zoneWest(zone), zoneWest(zone) + ZONE_WIDTH];
      return [{ designator: `${zone}${band}`, west, south, east, north }];
    });
  });

/** A grid line spacing, in metres: the 100 km squares and their decimal subdivisions. */
type GridSpacing = 100_000 | 10_000 | 1_000 | 100 | 10;

// Every spacing, from the 100 km squares down.
const GRID_SPACINGS: readonly GridSpacing[] = [100_000, 10_000, 1_000, 100, 10];

/**
 * The finest spacing whose cells are still at least `minPixels` across at `metresPerPixel`, so the
 * grid thickens as the map zooms in without ever turning into a smear of lines.
 *
 * @param metresPerPixel - The map's scale at the view.
 * @param minPixels - The narrowest a cell may be drawn.
 * @returns The spacing to draw, 100 km at the coarsest.
 */
export const spacingFor = (metresPerPixel: number, minPixels = 120): GridSpacing =>
  [...GRID_SPACINGS].reverse().find((spacing) => spacing / metresPerPixel >= minPixels) ??
  GRID_SPACINGS[0];

/** One grid line, as a path of points along its curve. */
type GridLine = {
  path: WGS84Coordinate[];
  /** A 100 km square edge, as opposed to a finer subdivision. */
  major: boolean;
};

/** A grid cell's MGRS reference, at the cell's precision, and where to place it: its centre. */
type GridLabel = { at: WGS84Coordinate; reference: MGRSCoordinate };

// Points along each grid line; enough for a 100 km line to follow its curve across a view.
const SAMPLES = 32;
// Projected extents are found from a lattice of points over the view, a little padded.
const LATTICE = 6;
const EXTENT_PADDING = 0.05;

// Padded, because the lattice can fall a little short of the view's true extent where the projection
// curves, and lines would then stop before the edge of the screen.
const paddedRange = (values: number[]) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min) * EXTENT_PADDING;
  return [min - padding, max + padding];
};
// Halvings to find where a line crosses its zone edge: 2^-20 of a sample interval, well under a
// millimetre even for a 100 km line across a wide view.
const EDGE_STEPS = 20;

const inUTM = ({ latitude }: WGS84Coordinate) =>
  latitude >= UTM_SOUTH_LIMIT && latitude <= UTM_NORTH_LIMIT;

/**
 * The MGRS grid inside `view`: lines `spacing` apart in every zone the view reaches, plus the
 * 100 km square identifiers. A line stops where its zone does, since past that edge MGRS is written
 * on the neighbouring zone's grid.
 *
 * @param view - The area to cover.
 * @param spacing - Distance between lines, in metres.
 * @param maxLines - The most lines worth drawing.
 * @returns The lines and labels, or null when the view would need more than `maxLines`.
 */
export const mgrsGrid = (
  view: Box,
  spacing: GridSpacing,
  maxLines = 600,
): { lines: GridLine[]; labels: GridLabel[] } | null => {
  const lines: GridLine[] = [];
  const labels: GridLabel[] = [];

  for (let zone = 1; zone <= 60; zone++) {
    // Widened by half a zone on each side, for the Norway and Svalbard exceptions.
    const west = Math.max(view.west, zoneWest(zone) - ZONE_WIDTH / 2);
    const east = Math.min(view.east, zoneWest(zone) + ZONE_WIDTH * 1.5);
    if (west >= east) continue;

    for (const hemisphere of ["N", "S"] as const) {
      // The southern side stops a hair short of the equator: a point on it is written as northern.
      const south = Math.max(view.south, hemisphere === "N" ? 0 : UTM_SOUTH_LIMIT);
      const north = Math.min(view.north, hemisphere === "N" ? UTM_NORTH_LIMIT : -1e-6);
      if (south >= north) continue;

      // fromWgs84ToUtm writes a point on the grid of the zone it falls in, exceptions included.
      const belongs = (point: WGS84Coordinate) =>
        inUTM(point) &&
        (hemisphere === "N") === point.latitude >= 0 &&
        fromWgs84ToUtm(point).zone === zone;
      // On this zone's grid, wherever the point lands: the line runs on past the zone's edge until
      // `belongs` cuts it. fromUtmToWgs84 gives the centre of the metre square around the position,
      // which is the position itself.
      const point = (easting: number, northing: number): WGS84Coordinate =>
        fromUtmToWgs84({ system: "UTM", zone, hemisphere, easting, northing });

      // Where along a line, between a sample inside the zone and one outside, the zone edge falls.
      const edgeBetween = (
        sample: (t: number) => WGS84Coordinate,
        inside: number,
        outside: number,
      ) => {
        for (let step = 0; step < EDGE_STEPS; step++) {
          const middle = (inside + outside) / 2;
          if (belongs(sample(middle))) inside = middle;
          else outside = middle;
        }
        return sample(inside);
      };

      // Where this zone's part of the view lies on the zone's grid: a lattice over the view, kept to
      // the points in this zone, plus the point where each row crosses the zone's edge.
      const lattice = Array.from({ length: LATTICE + 1 }, (_, i) => {
        const latitude = south + ((north - south) * i) / LATTICE;
        const at = (t: number): WGS84Coordinate => ({
          system: "WGS84",
          latitude,
          longitude: west + (east - west) * t,
        });
        return Array.from({ length: LATTICE + 1 }, (_, j) => j / LATTICE).flatMap((t, j, row) => {
          const inside = belongs(at(t));
          const crossed = j > 0 && inside !== belongs(at(row[j - 1]));
          const edge = crossed
            ? [inside ? edgeBetween(at, t, row[j - 1]) : edgeBetween(at, row[j - 1], t)]
            : [];
          return [...edge, ...(inside ? [at(t)] : [])];
        });
      })
        .flat()
        .map((inZone) => fromWgs84ToUtm(inZone));
      if (lattice.length === 0) continue;
      const [eMin, eMax] = paddedRange(lattice.map(({ easting }) => easting));
      const [nMin, nMax] = paddedRange(lattice.map(({ northing }) => northing));

      // A line as the runs of its samples that lie in this zone, each run carried exactly to the zone
      // edge where it meets one, so that the grids of neighbouring zones meet on the seam rather than
      // stopping short of it.
      const addLine = (sample: (t: number) => WGS84Coordinate, major: boolean) => {
        let run: WGS84Coordinate[] = [];
        let previous = -1;
        let wasInside = false;
        for (let k = 0; k <= SAMPLES; k++) {
          const t = k / SAMPLES;
          const candidate = sample(t);
          const inside = belongs(candidate);
          if (inside && !wasInside && previous >= 0) run.push(edgeBetween(sample, t, previous));
          if (inside) run.push(candidate);
          if (!inside && wasInside) {
            run.push(edgeBetween(sample, previous, t));
            if (run.length > 1) lines.push({ path: run, major });
            run = [];
          }
          wasInside = inside;
          previous = t;
        }
        if (run.length > 1) lines.push({ path: run, major });
      };

      const first = (value: number) => Math.ceil(value / spacing) * spacing;
      for (let easting = first(eMin); easting <= eMax; easting += spacing) {
        addLine((t) => point(easting, nMin + (nMax - nMin) * t), easting % 100_000 === 0);
      }
      for (let northing = first(nMin); northing <= nMax; northing += spacing) {
        addLine((t) => point(eMin + (eMax - eMin) * t, northing), northing % 100_000 === 0);
      }
      if (lines.length > maxLines) return null;

      // Each cell named at its centre, where that lies in this zone.
      const firstCell = (value: number) => Math.floor(value / spacing) * spacing;
      for (let easting = firstCell(eMin); easting <= eMax; easting += spacing) {
        for (let northing = firstCell(nMin); northing <= nMax; northing += spacing) {
          const centre = point(easting + spacing / 2, northing + spacing / 2);
          if (!belongs(centre)) continue;
          labels.push({ at: centre, reference: fromWgs84ToMgrs(centre, spacing) });
        }
      }
    }
  }

  return { lines, labels };
};

/**
 * The seams of the MGRS grid: the UTM zone edges, where one zone's grid gives way to the next. Only
 * the meridians — the grid runs straight across latitude band edges — with the Norway and Svalbard
 * exceptions, each edge once.
 *
 * @returns Each seam as a path from south to north.
 */
export const zoneSeams = (): WGS84Coordinate[][] => {
  const seen = new Set<string>();
  const seams: WGS84Coordinate[][] = [];
  for (const { west, east, south, north } of gridZones()) {
    for (const longitude of [west, east]) {
      const key = `${longitude}:${south}:${north}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seams.push([
        { system: "WGS84", latitude: south, longitude },
        { system: "WGS84", latitude: north, longitude },
      ]);
    }
  }
  return seams;
};
