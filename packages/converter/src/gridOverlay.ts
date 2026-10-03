import type { Coordinates } from "@coordinate-parser/parser";
import { LATITUDE_BANDS } from "./notation.ts";
import { formatUSNG, toMGRS } from "./MGRSconverter.ts";
import { project } from "./transverseMercator.ts";
import {
  bandLimits,
  UTM_NORTH_LIMIT,
  UTM_SOUTH_LIMIT,
  unprojectUTM,
  utmProjection,
  zoneOf,
} from "./UTMconverter.ts";

// The geometry of the UTM and MGRS grids, for drawing over a map.
//
//   * The UTM grid zones — a zone number and a latitude band, "36U" — are bounded by meridians and
//     parallels, so each is a plain box, and there are few enough to list them all.
//   * The MGRS grid is lines of constant easting and northing inside each zone: curves on a web map,
//     and far too many to draw for the whole world, so they are worked out for the view at hand.

/** A latitude/longitude box, in degrees. */
export type Box = { west: number; south: number; east: number; north: number };

/** A UTM grid zone and its box: `designator` is the zone number and band, "36U". */
export type GridZone = Box & { designator: string };

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
export type GridSpacing = 100_000 | 10_000 | 1_000 | 100 | 10;

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
export type GridLine = {
  path: Coordinates[];
  /** A 100 km square edge, as opposed to a finer subdivision. */
  major: boolean;
};

/** A 100 km square identifier and where to place it. */
export type GridLabel = { at: Coordinates; label: string };

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

const inUTM = ({ latitude }: Coordinates) =>
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
      const south = Math.max(view.south, hemisphere === "N" ? 0 : UTM_SOUTH_LIMIT);
      const north = Math.min(view.north, hemisphere === "N" ? UTM_NORTH_LIMIT : 0);
      if (south >= north) continue;

      const projection = utmProjection(zone, hemisphere);
      const lattice = Array.from({ length: LATTICE + 1 }, (_, i) =>
        Array.from({ length: LATTICE + 1 }, (_, j) =>
          project(
            {
              latitude: south + ((north - south) * i) / LATTICE,
              longitude: west + ((east - west) * j) / LATTICE,
            },
            projection,
          ),
        ),
      ).flat();
      const [eMin, eMax] = paddedRange(lattice.map(({ easting }) => easting));
      const [nMin, nMax] = paddedRange(lattice.map(({ northing }) => northing));

      const belongs = (point: Coordinates) =>
        inUTM(point) && (hemisphere === "N") === point.latitude >= 0 && zoneOf(point) === zone;
      const point = (easting: number, northing: number) =>
        unprojectUTM({ easting, northing }, zone, hemisphere);

      // Where along a line, between a sample inside the zone and one outside, the zone edge falls.
      const edgeBetween = (sample: (t: number) => Coordinates, inside: number, outside: number) => {
        for (let step = 0; step < EDGE_STEPS; step++) {
          const middle = (inside + outside) / 2;
          if (belongs(sample(middle))) inside = middle;
          else outside = middle;
        }
        return sample(inside);
      };

      // A line as the runs of its samples that lie in this zone, each run carried exactly to the zone
      // edge where it meets one, so that the grids of neighbouring zones meet on the seam rather than
      // stopping short of it.
      const addLine = (sample: (t: number) => Coordinates, major: boolean) => {
        let run: Coordinates[] = [];
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

      // Each cell named at its centre, where that lies in this zone. At 100 km that is the square
      // with its grid zone, "36U UA"; finer, the square and the digits at the grid's precision,
      // "UA 24 91" — the zone is plain from the 100 km labels, and would only crowd the small cells.
      const firstCell = (value: number) => Math.floor(value / spacing) * spacing;
      for (let easting = firstCell(eMin); easting <= eMax; easting += spacing) {
        for (let northing = firstCell(nMin); northing <= nMax; northing += spacing) {
          const centre = point(easting + spacing / 2, northing + spacing / 2);
          if (!belongs(centre)) continue;
          // A 100 km reference has no digits; its empty digit groups are dropped with the spaces.
          const [zoneAndBand, ...rest] = formatUSNG(toMGRS(centre, spacing))
            .split(" ")
            .filter(Boolean);
          labels.push({
            at: centre,
            label: spacing === 100_000 ? `${zoneAndBand} ${rest.join(" ")}` : rest.join(" "),
          });
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
export const zoneSeams = (): Coordinates[][] => {
  const seen = new Set<string>();
  const seams: Coordinates[][] = [];
  for (const { west, east, south, north } of gridZones()) {
    for (const longitude of [west, east]) {
      const key = `${longitude}:${south}:${north}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seams.push([
        { latitude: south, longitude },
        { latitude: north, longitude },
      ]);
    }
  }
  return seams;
};
