import type { Coordinates } from "../coordinates.ts";
import { beforeAll, expect, it } from "vitest";
import { agreement, type Check, runChecks, UCS2000_CHECKS, UTM_CHECKS } from "./checks.ts";
import { loadArcgis } from "./libraries.ts";
import { SLOW_SUITE } from "./slowConfig.ts";
import {
  grid,
  randomPoints,
  RUSSIA,
  squareBoundaries,
  ucs2000Boundaries,
  UKRAINE,
  utmBoundaries,
} from "./points.ts";

// The slow suite: the reference checks run densely over Ukraine and Russia, the region this
// converter is for. `pnpm test:slow` runs it; plain `pnpm test` leaves it out. How dense is set in
// ./slowConfig.ts, with time estimates for each setting.
//
// Vitest runs test files in parallel but the tests inside one file one after another, so the two
// dense grids are cut into shards by row, each shard a file of its own in ./slow. The parts:
//
//   * a grid over Ukraine with every check, UCS-2000 included;
//   * a grid over Russia with the UTM, MGRS and USNG checks, the Chukotka box beyond the
//     antimeridian included. UCS-2000 is defined for Ukraine only, so it is not checked there;
//   * every UTM zone edge, latitude band edge, 100 km MGRS square edge and UCS-2000 zone edge in the
//     region, crossed by rows of points half a metre apart. Inside a zone the maths is smooth and the
//     grids vouch for it; a disagreement at half-metre scale would be at an edge;
//   * points scattered over the region from a fixed seed, to catch what lines miss.

// Fixed by the shard files in ./slow, one file per shard.
const UKRAINE_SHARDS = 10;
const RUSSIA_SHARDS = 7;
const RANDOM_SHARDS = 2;

const kmLabel = (km: number) => (km < 1 ? `${km * 1000} m` : `${km} km`);

const HOUR = 3_600_000;

const suite = (name: string, points: () => Iterable<Coordinates>, checks: Check[]) => {
  beforeAll(loadArcgis, 120_000);

  it(
    name,
    () => {
      const { seen, results } = runChecks(points(), checks);
      expect(seen).toBeGreaterThan(0);
      expect(results).toEqual(agreement(checks));
    },
    HOUR,
  );
};

export const ukraineShard = (index: number) =>
  suite(
    `Ukraine every ${kmLabel(SLOW_SUITE.ukraineStepKm)}, shard ${index + 1} of ${UKRAINE_SHARDS}`,
    () => grid(UKRAINE, SLOW_SUITE.ukraineStepKm, { index, of: UKRAINE_SHARDS }),
    [...UTM_CHECKS, ...UCS2000_CHECKS],
  );

export const russiaShard = (index: number) =>
  suite(
    `Russia every ${kmLabel(SLOW_SUITE.russiaStepKm)}, shard ${index + 1} of ${RUSSIA_SHARDS}`,
    function* () {
      for (const box of RUSSIA) {
        yield* grid(box, SLOW_SUITE.russiaStepKm, { index, of: RUSSIA_SHARDS });
      }
    },
    UTM_CHECKS,
  );

const REGION = [UKRAINE, ...RUSSIA];

export const zoneAndBandEdges = () =>
  suite(
    "UTM zone and latitude band edges across Ukraine and Russia, half a metre apart",
    () => utmBoundaries(REGION, SLOW_SUITE.zoneEdgeAlongKm),
    UTM_CHECKS,
  );

export const squareEdges = () =>
  suite(
    "100 km MGRS square edges across Ukraine and Russia, half a metre apart",
    () => squareBoundaries(REGION, SLOW_SUITE.squareEdgeAlongKm),
    UTM_CHECKS,
  );

export const ucs2000Edges = () =>
  suite(
    "UCS-2000 zone edges across Ukraine, half a metre apart",
    () => ucs2000Boundaries(SLOW_SUITE.ucs2000EdgeAlongKm),
    [...UTM_CHECKS, ...UCS2000_CHECKS],
  );

export const scattered = (index: number) =>
  suite(
    `${Math.round(SLOW_SUITE.randomPoints / RANDOM_SHARDS).toLocaleString("en")} random points over Ukraine and Russia, shard ${index + 1} of ${RANDOM_SHARDS}`,
    () =>
      randomPoints(
        REGION,
        Math.round(SLOW_SUITE.randomPoints / RANDOM_SHARDS),
        SLOW_SUITE.randomSeed + index,
      ),
    UTM_CHECKS,
  );
