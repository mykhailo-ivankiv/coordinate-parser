import type { Coordinates } from "../coordinates.ts";
import { toDeclaredPrecision } from "../precision.ts";
import { UTM_NORTH_LIMIT, UTM_SOUTH_LIMIT, unprojectUTM, zoneOf } from "../UTMconverter.ts";

// The points the reference checks run on. Everything is a generator: the dense sets run to tens of
// millions of points, far too many to hold in memory at once.

export const KM_PER_DEGREE = 111.32;
const METRES_PER_DEGREE = KM_PER_DEGREE * 1000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Wraps a longitude into -180..180, for sweeps that cross the antimeridian. */
const wrap = (longitude: number) => ((((longitude + 180) % 360) + 360) % 360) - 180;

export type Box = { south: number; north: number; west: number; east: number };

/** Ukraine, by its extreme points; a little sea and neighbouring land comes with the box. */
export const UKRAINE: Box = { south: 44.3, north: 52.4, west: 22.1, east: 40.2 };

// Russia, as two boxes either side of the antimeridian: Kaliningrad at 19.6°E to the 180th
// meridian, and Chukotka beyond it to 169°W. The boxes take in neighbouring land and sea as well.
export const RUSSIA: Box[] = [
  { south: 41.2, north: 81.9, west: 19.6, east: 180 },
  { south: 64.2, north: 71.6, west: -180, east: -169 },
];

/**
 * A grid over `box`, `stepKm` apart in both directions. With `shard` set, only every `of`-th row,
 * starting at row `index`, so a grid too large for one worker can be split across several.
 */
export function* grid(
  { south, north, west, east }: Box,
  stepKm: number,
  shard: { index: number; of: number } = { index: 0, of: 1 },
): Generator<Coordinates> {
  let row = 0;
  for (let latitude = south; latitude <= north; latitude += stepKm / KM_PER_DEGREE, row++) {
    if (row % shard.of !== shard.index) continue;
    const step = stepKm / (KM_PER_DEGREE * Math.cos(toRadians(latitude)));
    for (let longitude = west; longitude < east; longitude += step) {
      yield toDeclaredPrecision({ latitude, longitude });
    }
  }
}

// A boundary is crossed by a short row of points half a metre apart, straddling it symmetrically:
// the nearest two sit a quarter of a metre either side, close enough that any disagreement over
// which side of the line a point falls on shows up.
const OFFSETS = Array.from({ length: 10 }, (_, index) => (index - 4.5) * 0.5); // metres

const insideUTM = ({ latitude }: Coordinates) =>
  latitude >= UTM_SOUTH_LIMIT && latitude <= UTM_NORTH_LIMIT;

const inBoxes =
  (boxes: Box[]) =>
  ({ latitude, longitude }: Coordinates) =>
    boxes.some(
      (box) =>
        latitude >= box.south &&
        latitude <= box.north &&
        longitude >= box.west &&
        longitude <= box.east,
    );

/** Points crossing the meridian `longitude`, every `alongKm` from `south` to `north`. */
function* acrossMeridian(longitude: number, south: number, north: number, alongKm: number) {
  for (let latitude = south; latitude <= north; latitude += alongKm / KM_PER_DEGREE) {
    const perMetre = 1 / (METRES_PER_DEGREE * Math.cos(toRadians(latitude)));
    for (const offset of OFFSETS) {
      yield toDeclaredPrecision({ latitude, longitude: wrap(longitude + offset * perMetre) });
    }
  }
}

/** Points crossing the parallel `latitude`, every `alongKm` from `west` to `east`. */
function* acrossParallel(latitude: number, west: number, east: number, alongKm: number) {
  const step = alongKm / (KM_PER_DEGREE * Math.cos(toRadians(latitude)));
  for (let longitude = west; longitude < east; longitude += step) {
    for (const offset of OFFSETS) {
      yield toDeclaredPrecision({ latitude: latitude + offset / METRES_PER_DEGREE, longitude });
    }
  }
}

// UTM zone edges every six degrees from the antimeridian, plus the edges NGA.STND.0037 moves for
// Norway (3°E in band V) and Svalbard (9°, 21°, 33°E in band X).
const ZONE_MERIDIANS = Array.from({ length: 60 }, (_, index) => -180 + index * 6);
const SPECIAL_MERIDIANS: [number, number, number][] = [
  [3, 56, 64],
  [9, 72, 84],
  [21, 72, 84],
  [33, 72, 84],
];

// Latitude band edges, eight degrees apart from 80°S, with band X running on to 84°N.
const BAND_PARALLELS = Array.from({ length: 21 }, (_, index) => -80 + index * 8).concat(84);

/** Every UTM zone edge and latitude band edge that crosses `boxes`, straddled at half a metre. */
export function* utmBoundaries(boxes: Box[], alongKm: number): Generator<Coordinates> {
  const keep = inBoxes(boxes);
  for (const box of boxes) {
    for (const meridian of ZONE_MERIDIANS) {
      if (meridian < box.west || meridian > box.east) continue;
      for (const point of acrossMeridian(meridian, box.south, box.north, alongKm)) {
        if (insideUTM(point) && keep(point)) yield point;
      }
    }
    for (const [meridian, south, north] of SPECIAL_MERIDIANS) {
      if (meridian < box.west || meridian > box.east) continue;
      const from = Math.max(south, box.south);
      const to = Math.min(north, box.north);
      for (const point of acrossMeridian(meridian, from, to, alongKm)) {
        if (insideUTM(point) && keep(point)) yield point;
      }
    }
    for (const parallel of BAND_PARALLELS) {
      if (parallel < box.south || parallel > box.north) continue;
      for (const point of acrossParallel(parallel, box.west, box.east, alongKm)) {
        if (insideUTM(point) && keep(point)) yield point;
      }
    }
  }
}

const SQUARE = 100_000;

/**
 * The edges of the 100 km MGRS squares inside `boxes`: lines of constant easting and of constant
 * northing at every multiple of 100 km, in every zone and hemisphere they reach, straddled at half a
 * metre. Only points that really belong to that zone are kept, since a point past a zone edge is
 * written in the neighbouring zone, on another grid.
 */
export function* squareBoundaries(boxes: Box[], alongKm: number): Generator<Coordinates> {
  const keep = inBoxes(boxes);
  const along = alongKm * 1000;

  for (let zone = 1; zone <= 60; zone++) {
    for (const hemisphere of ["N", "S"] as const) {
      const [lowest, highest] = hemisphere === "N" ? [0, 9_400_000] : [1_100_000, 10_000_000];
      const point = (easting: number, northing: number) =>
        toDeclaredPrecision(unprojectUTM({ easting, northing }, zone, hemisphere));
      const belongs = (candidate: Coordinates) =>
        keep(candidate) &&
        insideUTM(candidate) &&
        (hemisphere === "N") === candidate.latitude >= 0 &&
        zoneOf(candidate) === zone;

      // A cheap look before the full sweep: skip a zone whose middle row never touches the region.
      const probes = [lowest, (lowest + highest) / 2, highest].flatMap((northing) =>
        [200_000, 500_000, 800_000].map((easting) => point(easting, northing)),
      );
      const westmost = Math.min(...probes.map(({ longitude }) => longitude));
      const eastmost = Math.max(...probes.map(({ longitude }) => longitude));
      const touches = boxes.some((box) => eastmost >= box.west - 6 && westmost <= box.east + 6);
      if (!touches) continue;

      for (let easting = SQUARE; easting < 1_000_000; easting += SQUARE) {
        for (let northing = lowest; northing <= highest; northing += along) {
          for (const offset of OFFSETS) {
            const candidate = point(easting + offset, northing);
            if (belongs(candidate)) yield candidate;
          }
        }
      }
      for (let northing = lowest; northing <= highest; northing += SQUARE) {
        for (let easting = SQUARE; easting < 1_000_000; easting += along) {
          for (const offset of OFFSETS) {
            const candidate = point(easting, northing + offset);
            if (belongs(candidate)) yield candidate;
          }
        }
      }
    }
  }
}

/** The UCS-2000 zone edges inside Ukraine: 24°, 30° and 36°E, straddled at half a metre. */
export function* ucs2000Boundaries(alongKm: number): Generator<Coordinates> {
  for (const meridian of [24, 30, 36]) {
    yield* acrossMeridian(meridian, UKRAINE.south, UKRAINE.north, alongKm);
  }
}

// mulberry32: small, fast and seedable, so a failure found by a random point can be found again.
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * `count` points scattered evenly by area over `boxes`, from a fixed seed. Each box gets a share in
 * proportion to its area, and within a box latitude is drawn by its sine so that the narrowing
 * meridians do not crowd points towards the pole.
 */
export function* randomPoints(boxes: Box[], count: number, seed: number): Generator<Coordinates> {
  const next = random(seed);
  const area = (box: Box) =>
    (box.east - box.west) * (Math.sin(toRadians(box.north)) - Math.sin(toRadians(box.south)));
  const total = boxes.reduce((sum, box) => sum + area(box), 0);

  for (let drawn = 0; drawn < count; drawn++) {
    let pick = next() * total;
    const box =
      boxes.find((candidate) => (pick -= area(candidate)) <= 0) ?? boxes[boxes.length - 1];
    const sine =
      Math.sin(toRadians(box.south)) +
      next() * (Math.sin(toRadians(box.north)) - Math.sin(toRadians(box.south)));
    yield toDeclaredPrecision({
      latitude: (Math.asin(sine) * 180) / Math.PI,
      longitude: box.west + next() * (box.east - box.west),
    });
  }
}
