/// <reference types="node" />
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import config from "@arcgis/core/config.js";
import * as coordinateFormatter from "@arcgis/core/geometry/coordinateFormatter.js";
import Point from "@arcgis/core/geometry/Point.js";
import * as mgrs from "mgrs";
import proj4 from "proj4";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Coordinates } from "../parsers/commonParsers.ts";
import { systemParsers } from "../parsers/coordinateParser.ts";
import { fromWGS84, toWGS84 } from "./coordinateConverter.ts";
import { toDeclaredPrecision } from "./precision.ts";
import { ucs2000Grid, ucs2000ZoneOf } from "./UCS2000converter.ts";
import { projectToUTM, unprojectUTM } from "./UTMconverter.ts";

// Our conversions checked against three public libraries, over the whole globe at a 100 km step:
//
//   * proj4js, the JavaScript port of PROJ — the numbers. It runs the same transverse Mercator and
//     the same EPSG:5840 datum shift, so UTM and UCS-2000 must agree to the millimetre.
//   * ArcGIS Maps SDK for JavaScript, whose coordinate formatter runs on Esri's Projection Engine —
//     the written UTM, MGRS and USNG strings, and reading ours back.
//   * mgrs, the proj4js project's MGRS package — MGRS strings, and reading ours back.

const STEP_KM = 100;
const KM_PER_DEGREE = 111.32;

/** Points 100 km apart in both directions, rounded to the seven decimals both sides accept. */
const grid = (south: number, north: number, west = -180, east = 180): Coordinates[] => {
  const points: Coordinates[] = [];
  for (let latitude = south; latitude <= north; latitude += STEP_KM / KM_PER_DEGREE) {
    const step = STEP_KM / (KM_PER_DEGREE * Math.cos((latitude * Math.PI) / 180));
    for (let longitude = west; longitude < east; longitude += step) {
      points.push(toDeclaredPrecision({ latitude, longitude }));
    }
  }
  return points;
};

// UTM, MGRS and USNG stop where UPS takes over at the poles.
const UTM_GLOBE = grid(-80, 84);
// UCS-2000 is defined over Ukraine; ours refuses anything outside zones 4-7.
const UKRAINE = grid(44.3, 52.4, 22.1, 40.2);

type Mismatch = { point: Coordinates; ours: string; theirs: string };

const MAX_REPORTED = 10;

/** Runs `check` on every point and returns the ones it rejects, at most MAX_REPORTED of them. */
const mismatches = (points: Coordinates[], check: (point: Coordinates) => Mismatch | null) => {
  const found: Mismatch[] = [];
  let total = 0;
  for (const point of points) {
    const mismatch = check(point);
    if (mismatch === null) continue;
    total += 1;
    if (found.length < MAX_REPORTED) found.push(mismatch);
  }
  return { total, of: points.length, first: found };
};

const none = (points: Coordinates[]) => ({ total: 0, of: points.length, first: [] });

const formatPoint = ({ latitude, longitude }: Coordinates) =>
  `${latitude.toFixed(7)}, ${longitude.toFixed(7)}`;

/**
 * Ground distance between two nearby points, in metres. The longitude difference is taken the short
 * way round, so 179.9999865° and -180.0000135° count as the same place.
 */
const metresApart = (a: Coordinates, b: Coordinates) => {
  const longitudes = ((((a.longitude - b.longitude) % 360) + 540) % 360) - 180;
  return Math.hypot(
    (a.latitude - b.latitude) * KM_PER_DEGREE * 1000,
    longitudes * KM_PER_DEGREE * 1000 * Math.cos((a.latitude * Math.PI) / 180),
  );
};

// Spacing differs — MGRS is compact here, spaced in ArcGIS — and ArcGIS may pad the zone number.
const normalised = (value: string) => value.replace(/\s+/g, "").replace(/^0(\d[A-Z])/, "$1");

// MGRS truncates to the metre, so a point whose exact easting or northing lies within a hair of a
// whole metre can be written either way by two correct implementations. The mgrs package uses a
// shorter UTM series than ours — a fraction of a millimetre apart — and ours agrees with PROJ.
const TRUNCATION_EDGE = 0.001; // metres
const onTruncationEdge = (point: Coordinates) => {
  const { easting, northing } = projectToUTM(point);
  return [easting, northing].some((metres) => {
    const fraction = metres - Math.floor(metres);
    return fraction < TRUNCATION_EDGE || fraction > 1 - TRUNCATION_EDGE;
  });
};

const MILLIMETRE = 0.001;

// proj4js definitions matching ours: UTM on WGS 84, and the UCS-2000 Gauss-Kruger zones with the
// EPSG:5840 shift written as a seven-parameter Helmert whose rotations and scale are zero.
const utmDefinition = (zone: number, hemisphere: "N" | "S") =>
  `+proj=utm +zone=${zone}${hemisphere === "S" ? " +south" : ""} +datum=WGS84 +units=m +no_defs`;
const ucs2000Definition = (zone: number) =>
  `+proj=tmerc +lat_0=0 +lon_0=${zone * 6 - 3} +k=1 +x_0=${zone * 1_000_000 + 500_000} +y_0=0 ` +
  "+ellps=krass +towgs84=24,-121,-76,0,0,0,0 +units=m +no_defs";

const WGS84 = "EPSG:4326";

describe("against proj4js", () => {
  it("projects every point to the same UTM easting and northing, to the millimetre", () => {
    const result = mismatches(UTM_GLOBE, (point) => {
      const { zone, hemisphere, easting, northing } = projectToUTM(point);
      const [east, north] = proj4(WGS84, utmDefinition(zone, hemisphere), [
        point.longitude,
        point.latitude,
      ]);
      return Math.abs(east - easting) <= MILLIMETRE && Math.abs(north - northing) <= MILLIMETRE
        ? null
        : {
            point,
            ours: `${zone}${hemisphere} ${easting.toFixed(4)} ${northing.toFixed(4)}`,
            theirs: `${east.toFixed(4)} ${north.toFixed(4)}`,
          };
    });
    expect(result).toEqual(none(UTM_GLOBE));
  });

  it("brings every UTM easting and northing back to the same point, to the millimetre", () => {
    const result = mismatches(UTM_GLOBE, (point) => {
      const { zone, hemisphere, easting, northing } = projectToUTM(point);
      const ours = unprojectUTM({ easting, northing }, zone, hemisphere);
      const [longitude, latitude] = proj4(utmDefinition(zone, hemisphere), WGS84, [
        easting,
        northing,
      ]);
      const theirs = { latitude, longitude };
      return metresApart(ours, theirs) <= MILLIMETRE
        ? null
        : { point, ours: formatPoint(ours), theirs: formatPoint(theirs) };
    });
    expect(result).toEqual(none(UTM_GLOBE));
  });

  it("puts every point of Ukraine at the same UCS-2000 X and Y, to the millimetre", () => {
    const result = mismatches(UKRAINE, (point) => {
      const zone = ucs2000ZoneOf(point);
      const { easting, northing } = ucs2000Grid(zone).project(point);
      const [y, x] = proj4(WGS84, ucs2000Definition(zone), [point.longitude, point.latitude]);
      const ourY = zone * 1_000_000 + easting;
      return Math.abs(x - northing) <= MILLIMETRE && Math.abs(y - ourY) <= MILLIMETRE
        ? null
        : {
            point,
            ours: `${northing.toFixed(4)} ${ourY.toFixed(4)}`,
            theirs: `${x.toFixed(4)} ${y.toFixed(4)}`,
          };
    });
    expect(result).toEqual(none(UKRAINE));
  });

  it("brings every UCS-2000 X and Y back to the same point, to the millimetre", () => {
    const result = mismatches(UKRAINE, (point) => {
      const zone = ucs2000ZoneOf(point);
      const location = ucs2000Grid(zone).project(point);
      const ours = ucs2000Grid(zone).unproject(location);
      const [longitude, latitude] = proj4(ucs2000Definition(zone), WGS84, [
        zone * 1_000_000 + location.easting,
        location.northing,
      ]);
      const theirs = { latitude, longitude };
      return metresApart(ours, theirs) <= MILLIMETRE
        ? null
        : { point, ours: formatPoint(ours), theirs: formatPoint(theirs) };
    });
    expect(result).toEqual(none(UKRAINE));
  });
});

// ArcGIS is built for the browser: it fetches its Projection Engine, pe-wasm.wasm, from its assets
// folder, and Node's fetch does not read file: URLs. The assets ship inside @arcgis/core, so the
// folder is pointed at node_modules and fetch is taught to read local files for the duration.
const nativeFetch = globalThis.fetch;

const fetchLocalFiles = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  if (!url.startsWith("file:")) return nativeFetch(input, init);
  const type = url.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
  return new Response(await readFile(fileURLToPath(url)), { headers: { "content-type": type } });
}) as typeof fetch;

describe("against ArcGIS's coordinate formatter", () => {
  beforeAll(async () => {
    globalThis.fetch = fetchLocalFiles;
    config.assetsPath = pathToFileURL(join(process.cwd(), "node_modules/@arcgis/core/assets")).href;
    await coordinateFormatter.load();
  }, 60_000);

  afterAll(() => {
    globalThis.fetch = nativeFetch;
  });

  const arcgisPoint = ({ latitude, longitude }: Coordinates) => new Point({ latitude, longitude });

  const fromArcgis = (point: Point | null | undefined): Coordinates | null =>
    point?.latitude == null || point.longitude == null
      ? null
      : { latitude: point.latitude, longitude: point.longitude };

  it("writes the same MGRS reference at 1 m, everywhere from 80°S to 84°N", () => {
    const result = mismatches(UTM_GLOBE, (point) => {
      const ours = fromWGS84(point, "MGRS").value;
      const theirs = coordinateFormatter.toMgrs(arcgisPoint(point), "automatic", 5, true) ?? "";
      return normalised(ours) === normalised(theirs) || onTruncationEdge(point)
        ? null
        : { point, ours, theirs };
    });
    expect(result).toEqual(none(UTM_GLOBE));
  });

  it("writes the same USNG reference at 1 m, everywhere from 80°S to 84°N", () => {
    const result = mismatches(UTM_GLOBE, (point) => {
      const ours = fromWGS84(point, "USNG").value;
      const theirs = coordinateFormatter.toUsng(arcgisPoint(point), 5, true) ?? "";
      return normalised(ours) === normalised(theirs) || onTruncationEdge(point)
        ? null
        : { point, ours, theirs };
    });
    expect(result).toEqual(none(UTM_GLOBE));
  });

  // ArcGIS truncates UTM to the metre where we round, so the strings can differ by one in the last
  // digit. Compared against our unrounded projection instead, its value must be that projection with
  // the fraction dropped: same zone, same band, and easting and northing within a metre below.
  it("puts every point in the same UTM zone and band, at the same metre", () => {
    const result = mismatches(UTM_GLOBE, (point) => {
      const { zone, band, easting, northing } = projectToUTM(point);
      const theirs =
        coordinateFormatter.toUtm(arcgisPoint(point), "latitude-band-indicators", true) ?? "";
      const [designator, east, north] = theirs.split(/\s+/);
      const truncatedFrom = (exact: number, written: number) =>
        exact - written > -1e-6 && exact - written < 1 + 1e-6;

      return normalised(designator) === `${zone}${band}` &&
        truncatedFrom(easting, Number(east)) &&
        truncatedFrom(northing, Number(north))
        ? null
        : { point, ours: `${zone}${band} ${easting.toFixed(3)} ${northing.toFixed(3)}`, theirs };
    });
    expect(result).toEqual(none(UTM_GLOBE));
  });

  // ArcGIS reads a reference as the south-west corner of its square, we as the centre; for the 1 m
  // squares written here the two are at most 0.71 m apart.
  const READ_BACK: Record<"MGRS" | "USNG" | "UTM", (value: string) => Point | null | undefined> = {
    MGRS: (value) => coordinateFormatter.fromMgrs(value, null, "automatic"),
    USNG: (value) => coordinateFormatter.fromUsng(value, null),
    UTM: (value) => coordinateFormatter.fromUtm(value, null, "latitude-band-indicators"),
  };
  const READ_BACK_TOLERANCE = { MGRS: 0.75, USNG: 0.75, UTM: 0.01 };

  it.each(["MGRS", "USNG", "UTM"] as const)("reads our %s values back to the same point", (system) => {
    const result = mismatches(UTM_GLOBE, (point) => {
      const value = fromWGS84(point, system).value;
      const parsed = systemParsers[system].run(value);
      if (parsed.isError) return { point, ours: `unparseable: ${value}`, theirs: "" };

      const ours = toWGS84(parsed.result);
      const theirs = fromArcgis(READ_BACK[system](value));
      if (theirs === null) return { point, ours: value, theirs: "rejected" };
      return metresApart(ours, theirs) <= READ_BACK_TOLERANCE[system]
        ? null
        : { point, ours: `${value} → ${formatPoint(ours)}`, theirs: formatPoint(theirs) };
    });
    expect(result).toEqual(none(UTM_GLOBE));
  });
});

describe("against the mgrs package", () => {
  it("writes the same MGRS reference at 1 m, everywhere from 80°S to 84°N", () => {
    const result = mismatches(UTM_GLOBE, (point) => {
      const ours = fromWGS84(point, "MGRS").value;
      const theirs = mgrs.forward([point.longitude, point.latitude], 5);
      return normalised(ours) === normalised(theirs) || onTruncationEdge(point)
        ? null
        : { point, ours, theirs };
    });
    expect(result).toEqual(none(UTM_GLOBE));
  });

  // Both read a reference as the centre of its square. The package's shorter UTM series leaves a few
  // centimetres at the far edge of the widened Svalbard zones.
  it("reads our MGRS values back to the same point", () => {
    const result = mismatches(UTM_GLOBE, (point) => {
      const value = fromWGS84(point, "MGRS").value;
      const parsed = systemParsers.MGRS.run(value);
      if (parsed.isError) return { point, ours: `unparseable: ${value}`, theirs: "" };

      const ours = toWGS84(parsed.result);
      const [longitude, latitude] = mgrs.toPoint(value);
      const theirs = { latitude, longitude };
      return metresApart(ours, theirs) <= 0.1
        ? null
        : { point, ours: `${value} → ${formatPoint(ours)}`, theirs: formatPoint(theirs) };
    });
    expect(result).toEqual(none(UTM_GLOBE));
  });
});
