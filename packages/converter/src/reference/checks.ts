import Point from "@arcgis/core/geometry/Point.js";
import { format } from "@coordinate-parser/formatter";
import * as mgrs from "mgrs";
import type { Coordinates } from "../coordinates.ts";
import { mgrsParser, usngParser, utmParser } from "@coordinate-parser/parser";
import { fromWGS84, toWGS84 } from "../coordinateConverter.ts";
import { ucs2000Grid, ucs2000ZoneOf } from "../ucs2000.ts";
import { projectToUTM, unprojectUTM } from "../utm.ts";
import { coordinateFormatter, proj4UCS2000, proj4UTM } from "./libraries.ts";
import { KM_PER_DEGREE } from "./points.ts";

// Each check compares our answer for one point with a reference library's, and returns null when
// they agree or a description of the disagreement when they do not.

export type Mismatch = { point: Coordinates; ours: string; theirs: string };

export type Check = { name: string; check: (point: Coordinates) => Mismatch | null };

const MILLIMETRE = 0.001;

const formatPoint = ({ latitude, longitude }: Coordinates) =>
  `${latitude.toFixed(7)}, ${longitude.toFixed(7)}`;

/**
 * Ground distance between two nearby points, in metres. The longitude difference is taken the short
 * way round, so 179.9999865° and -180.0000135° count as the same place.
 */
const metresApart = (a: Coordinates, b: Coordinates) => {
  const longitudeDifference = ((((a.longitude - b.longitude) % 360) + 540) % 360) - 180;
  return Math.hypot(
    (a.latitude - b.latitude) * KM_PER_DEGREE * 1000,
    longitudeDifference * KM_PER_DEGREE * 1000 * Math.cos((a.latitude * Math.PI) / 180),
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

const arcgisPoint = ({ latitude, longitude }: Coordinates) => new Point({ latitude, longitude });

const fromArcgis = (point: Point | null | undefined): Coordinates | null =>
  point?.latitude == null || point.longitude == null
    ? null
    : { latitude: point.latitude, longitude: point.longitude };

const OUR_PARSERS = { MGRS: mgrsParser, USNG: usngParser, UTM: utmParser };

/** Our value for `system`, read back by our own parser, and the point we take it to mean. */
const ourReading = (point: Coordinates, system: keyof typeof OUR_PARSERS) => {
  const value = format([fromWGS84({ system: "WGS84", ...point }, system)]);
  const parsed = OUR_PARSERS[system].run(value);
  return { value, coords: parsed.isError ? null : toWGS84(parsed.result[0]) };
};

const sameString =
  (system: "MGRS" | "USNG", theirs: (point: Coordinates) => string): Check["check"] =>
  (point) => {
    const ours = format([fromWGS84({ system: "WGS84", ...point }, system)]);
    const written = theirs(point);
    return normalised(ours) === normalised(written) || onTruncationEdge(point)
      ? null
      : { point, ours, theirs: written };
  };

const readsBack =
  (
    system: "MGRS" | "USNG" | "UTM",
    read: (value: string) => Coordinates | null,
    tolerance: number,
  ): Check["check"] =>
  (point) => {
    const { value, coords } = ourReading(point, system);
    if (coords === null) return { point, ours: `unparseable: ${value}`, theirs: "" };
    const theirs = read(value);
    if (theirs === null) return { point, ours: value, theirs: "rejected" };
    return metresApart(coords, theirs) <= tolerance
      ? null
      : { point, ours: `${value} → ${formatPoint(coords)}`, theirs: formatPoint(theirs) };
  };

/** Checks that apply wherever UTM does, 80°S to 84°N. */
export const UTM_CHECKS: Check[] = [
  {
    name: "proj4js: UTM easting and northing, to the millimetre",
    check: (point) => {
      const { zone, hemisphere, easting, northing } = projectToUTM(point);
      const [east, north] = proj4UTM(zone, hemisphere).forward([point.longitude, point.latitude]);
      return Math.abs(east - easting) <= MILLIMETRE && Math.abs(north - northing) <= MILLIMETRE
        ? null
        : {
            point,
            ours: `${zone}${hemisphere} ${easting.toFixed(4)} ${northing.toFixed(4)}`,
            theirs: `${east.toFixed(4)} ${north.toFixed(4)}`,
          };
    },
  },
  {
    name: "proj4js: UTM back to the same point, to the millimetre",
    check: (point) => {
      const { zone, hemisphere, easting, northing } = projectToUTM(point);
      const ours = unprojectUTM({ easting, northing }, zone, hemisphere);
      const [longitude, latitude] = proj4UTM(zone, hemisphere).inverse([easting, northing]);
      const theirs = { latitude, longitude };
      return metresApart(ours, theirs) <= MILLIMETRE
        ? null
        : { point, ours: formatPoint(ours), theirs: formatPoint(theirs) };
    },
  },
  {
    name: "ArcGIS: the same MGRS reference at 1 m",
    check: sameString(
      "MGRS",
      (point) => coordinateFormatter.toMgrs(arcgisPoint(point), "automatic", 5, true) ?? "",
    ),
  },
  {
    name: "ArcGIS: the same USNG reference at 1 m",
    check: sameString(
      "USNG",
      (point) => coordinateFormatter.toUsng(arcgisPoint(point), 5, true) ?? "",
    ),
  },
  // ArcGIS truncates UTM to the metre where we round, so the strings can differ by one in the last
  // digit. Compared against our unrounded projection instead, its value must be that projection with
  // the fraction dropped: same zone, same band, and easting and northing within a metre below.
  {
    name: "ArcGIS: the same UTM zone, band and metre",
    check: (point) => {
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
    },
  },
  // ArcGIS reads a reference as the south-west corner of its square, we as the centre; for the 1 m
  // squares written here the two are at most 0.71 m apart.
  {
    name: "ArcGIS: reads our MGRS back to the same point",
    check: readsBack(
      "MGRS",
      (value) => fromArcgis(coordinateFormatter.fromMgrs(value, null, "automatic")),
      0.75,
    ),
  },
  {
    name: "ArcGIS: reads our USNG back to the same point",
    check: readsBack(
      "USNG",
      (value) => fromArcgis(coordinateFormatter.fromUsng(value, null)),
      0.75,
    ),
  },
  {
    name: "ArcGIS: reads our UTM back to the same point",
    check: readsBack(
      "UTM",
      (value) => fromArcgis(coordinateFormatter.fromUtm(value, null, "latitude-band-indicators")),
      0.01,
    ),
  },
  {
    name: "mgrs: the same MGRS reference at 1 m",
    check: sameString("MGRS", (point) => mgrs.forward([point.longitude, point.latitude], 5)),
  },
  // Both read a reference as the centre of its square. The package's shorter UTM series leaves a few
  // centimetres at the far edge of the widened Svalbard zones.
  {
    name: "mgrs: reads our MGRS back to the same point",
    check: readsBack(
      "MGRS",
      (value) => {
        const [longitude, latitude] = mgrs.toPoint(value);
        return { latitude, longitude };
      },
      0.1,
    ),
  },
];

/** Checks that apply only where UCS-2000 is defined: Ukraine, zones 4-7. */
export const UCS2000_CHECKS: Check[] = [
  {
    name: "proj4js: UCS-2000 X and Y, to the millimetre",
    check: (point) => {
      const zone = ucs2000ZoneOf(point);
      const { easting, northing } = ucs2000Grid(zone).project(point);
      const [y, x] = proj4UCS2000(zone).forward([point.longitude, point.latitude]);
      const ourY = zone * 1_000_000 + easting;
      return Math.abs(x - northing) <= MILLIMETRE && Math.abs(y - ourY) <= MILLIMETRE
        ? null
        : {
            point,
            ours: `${northing.toFixed(4)} ${ourY.toFixed(4)}`,
            theirs: `${x.toFixed(4)} ${y.toFixed(4)}`,
          };
    },
  },
  {
    name: "proj4js: UCS-2000 back to the same point, to the millimetre",
    check: (point) => {
      const zone = ucs2000ZoneOf(point);
      const location = ucs2000Grid(zone).project(point);
      const ours = ucs2000Grid(zone).unproject(location);
      const [longitude, latitude] = proj4UCS2000(zone).inverse([
        zone * 1_000_000 + location.easting,
        location.northing,
      ]);
      const theirs = { latitude, longitude };
      return metresApart(ours, theirs) <= MILLIMETRE
        ? null
        : { point, ours: formatPoint(ours), theirs: formatPoint(theirs) };
    },
  },
];

const MAX_REPORTED = 10;

export type Result = { total: number; first: Mismatch[] };

/**
 * Runs every check on every point in a single pass, so a large point set is generated once. Returns
 * each check's mismatch count and the first few mismatches, plus how many points were seen.
 */
export const runChecks = (points: Iterable<Coordinates>, checks: Check[]) => {
  const results: Record<string, Result> = Object.fromEntries(
    checks.map(({ name }) => [name, { total: 0, first: [] }]),
  );
  let seen = 0;
  for (const point of points) {
    seen += 1;
    for (const { name, check } of checks) {
      const mismatch = check(point);
      if (mismatch === null) continue;
      const result = results[name];
      result.total += 1;
      if (result.first.length < MAX_REPORTED) result.first.push(mismatch);
    }
  }
  return { seen, results };
};

/** What runChecks returns when nothing disagrees. */
export const agreement = (checks: Check[]) =>
  Object.fromEntries(checks.map(({ name }) => [name, { total: 0, first: [] }]));
