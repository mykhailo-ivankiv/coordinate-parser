import { beforeAll, describe, expect, it } from "vitest";
import { type Check, runChecks, UCS2000_CHECKS, UTM_CHECKS } from "./reference/checks.ts";
import { loadArcgis } from "./reference/libraries.ts";
import { grid, UKRAINE } from "./reference/points.ts";

// Our conversions against proj4js, ArcGIS and the mgrs package, over the whole globe at a 100 km
// step: about fifty thousand points. The libraries and the checks live in ./reference; the dense
// half-metre sweeps over Ukraine and Russia are the slow suite, `pnpm test:slow`.

const GLOBE = { south: -80, north: 84, west: -180, east: 180 };
const STEP_KM = 100;

beforeAll(loadArcgis, 60_000);

const expectAgreement = (
  points: Iterable<{ latitude: number; longitude: number }>,
  check: Check,
) => {
  const { seen, results } = runChecks(points, [check]);
  expect(seen).toBeGreaterThan(0);
  expect(results[check.name]).toEqual({ total: 0, first: [] });
};

describe("over the globe, every 100 km", () => {
  it.each(UTM_CHECKS.map((check) => [check.name, check] as const))("%s", (_, check) => {
    expectAgreement(grid(GLOBE, STEP_KM), check);
  });
});

describe("over Ukraine, every 100 km", () => {
  it.each(UCS2000_CHECKS.map((check) => [check.name, check] as const))("%s", (_, check) => {
    expectAgreement(grid(UKRAINE, STEP_KM), check);
  });
});
