import type { Coordinates } from "./coordinates.ts";
import type { UTMCoordinate, WGS84Coordinate } from "@coordinate-parser/types";
import { LATITUDE_BANDS } from "./notation.ts";
import { WGS84_ELLIPSOID } from "./ellipsoid.ts";
import { squareCentre, squareCorners, toDeclaredPrecision } from "./area.ts";
import { type Projected, type Projection, project, unproject } from "./transverseMercator.ts";

// WGS 84 latitude/longitude to and from UTM, per NGA.STND.0037_2.0.0_GRIDS §2 —
// https://nsgreg.nga.mil/doc/view?i=4057
//
// The letter written after the zone is a latitude band, the reading UTMparser uses, so a converted
// value always parses back to itself.

export const UTM_SOUTH_LIMIT = -80;
export const UTM_NORTH_LIMIT = 84;

const SOUTHERN_FALSE_NORTHING = 10000000;
const BAND_HEIGHT = 8;

export const centralMeridianOf = (zone: number) => zone * 6 - 183;

export const utmProjection = (zone: number, hemisphere: "N" | "S"): Projection => ({
  ellipsoid: WGS84_ELLIPSOID,
  centralMeridian: centralMeridianOf(zone),
  scale: 0.9996,
  falseEasting: 500000,
  falseNorthing: hemisphere === "S" ? SOUTHERN_FALSE_NORTHING : 0,
});

export const bandOf = (latitude: number) =>
  LATITUDE_BANDS[Math.min(Math.floor(latitude / BAND_HEIGHT) + 10, LATITUDE_BANDS.length - 1)];

/**
 * The southern and northern edge of a UTM and MGRS latitude band: 8° each from 80°S, except band X,
 * which runs 72°N to 84°N.
 *
 * @param band - The band letter, C-X without I and O.
 * @returns `[south, north]`, in degrees of latitude.
 *
 * @example
 * ```ts
 * bandLimits("U")
 * // → [48, 56]
 * bandLimits("X")
 * // → [72, 84]
 * ```
 */
export const bandLimits = (band: string): [number, number] => {
  const south = (LATITUDE_BANDS.indexOf(band) - 10) * BAND_HEIGHT;
  // Band X is the one exception to the eight-degree rule: it runs 72-84°N, twelve degrees.
  return [south, band === "X" ? UTM_NORTH_LIMIT : south + BAND_HEIGHT];
};

export const hemisphereOfLatitude = (latitude: number): "N" | "S" => (latitude < 0 ? "S" : "N");

/**
 * The UTM zone a point falls in: six degrees wide, counted east from the antimeridian, with the
 * exceptions NGA.STND.0037 carves out around Norway and Svalbard so that no country is split.
 *
 * @param point - The point, latitude and longitude in WGS 84.
 * @returns The zone number, 1-60.
 *
 * @example
 * ```ts
 * zoneOf({ latitude: 50.4501, longitude: 30.5234 })
 * // → 36
 * zoneOf({ latitude: 60, longitude: 5 })
 * // → 32
 * ```
 */
export const zoneOf = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
  const zone = (Math.floor((longitude + 180) / 6) % 60) + 1;
  const band = bandOf(latitude);

  if (band === "V" && zone === 31 && longitude >= 3) return 32;
  if (band === "X") {
    if (zone === 32) return longitude < 9 ? 31 : 33;
    if (zone === 34) return longitude < 21 ? 33 : 35;
    if (zone === 36) return longitude < 33 ? 35 : 37;
  }
  return zone;
};

const assertWithinUTM = ({ latitude }: Coordinates) => {
  if (latitude < UTM_SOUTH_LIMIT || latitude > UTM_NORTH_LIMIT) {
    throw new RangeError(
      `UTM covers latitudes ${UTM_SOUTH_LIMIT}° to ${UTM_NORTH_LIMIT}°, but got ${latitude}°; the polar caps belong to UPS, which is not supported`,
    );
  }
};

/**
 * The exact, unrounded UTM position of a point, in its own zone. MGRS builds on this rather than on
 * `fromWgs84ToUtm`, because MGRS truncates and must not see a value that has already been rounded up.
 */
export const projectToUTM = (coords: Coordinates) => {
  assertWithinUTM(coords);
  const zone = zoneOf(coords);
  const hemisphere = hemisphereOfLatitude(coords.latitude);
  return {
    zone,
    hemisphere,
    band: bandOf(coords.latitude),
    ...project(coords, utmProjection(zone, hemisphere)),
  };
};

/**
 * A WGS 84 point as a UTM position, rounded to the whole metre UTM is written in.
 *
 * @param point - The point, WGS 84 latitude and longitude.
 * @returns The UTM position, with its latitude band.
 * @throws RangeError outside 80°S-84°N, where UTM gives way to the polar UPS grid.
 *
 * @example
 * ```ts
 * fromWgs84ToUtm({ system: "WGS84", latitude: 50.4501, longitude: 30.5234 })
 * // → { system: "UTM", zone: 36, band: "U", hemisphere: "N", easting: 324182, northing: 5591608 }
 * ```
 */
export const fromWgs84ToUtm = (point: WGS84Coordinate): UTMCoordinate => {
  const { zone, hemisphere, band, easting, northing } = projectToUTM(toDeclaredPrecision(point));
  return {
    system: "UTM",
    zone,
    band,
    hemisphere,
    easting: Math.round(easting),
    northing: Math.round(northing),
  };
};

export const unprojectUTM = (location: Projected, zone: number, hemisphere: "N" | "S") =>
  unproject(location, utmProjection(zone, hemisphere));

/**
 * The grid of one UTM zone, unrounded: `project` takes a point to metres east and north, `unproject`
 * takes them back. Points outside the zone still project, onto its extended grid.
 *
 * @param zone - The zone number, 1-60.
 * @param hemisphere - Which false northing applies.
 * @returns The zone's projection both ways.
 *
 * @example
 * ```ts
 * utmGrid(36, "N").project({ latitude: 50.4501, longitude: 30.5234 }).easting > 324181
 * // → true
 * ```
 */
export const utmGrid = (zone: number, hemisphere: "N" | "S") => ({
  project: (point: {
    latitude: number;
    longitude: number;
  }): { easting: number; northing: number } => project(point, utmProjection(zone, hemisphere)),
  unproject: (location: {
    easting: number;
    northing: number;
  }): { latitude: number; longitude: number } => unprojectUTM(location, zone, hemisphere),
});

// A written reference is rounded to the metre, so a point on a band edge can land a hair across it.
// About ten metres of slack absorbs that and still catches a band that is simply wrong.
export const BAND_TOLERANCE = 0.0001;

/**
 * The metre square a UTM reference names: written to the whole metre, it stands for everything
 * within half a metre of its easting and northing. When the reference names a latitude band, its
 * centre is checked against it.
 */
const utmSquare = ({ zone, hemisphere, band, easting, northing }: UTMCoordinate) => {
  const fromGrid = (location: Projected) => unprojectUTM(location, zone, hemisphere);
  const southWest = { easting: easting - 0.5, northing: northing - 0.5 };
  const centre = squareCentre(fromGrid, southWest, 1);

  if (band !== undefined) {
    const [south, north] = bandLimits(band);
    const { latitude } = centre;
    if (latitude < south - BAND_TOLERANCE || latitude > north + BAND_TOLERANCE) {
      throw new RangeError(
        `UTM band ${band} spans ${south}° to ${north}°, but northing ${northing} lies at ${latitude.toFixed(4)}°`,
      );
    }
  }

  return { fromGrid, southWest, centre };
};

/**
 * A UTM position as a WGS 84 point: the centre of the metre square the position names.
 *
 * @param position - The UTM position.
 * @returns The point, WGS 84 latitude and longitude.
 * @throws RangeError for a latitude band the northing contradicts.
 *
 * @example
 * ```ts
 * fromUtmToWgs84({ system: "UTM", zone: 17, hemisphere: "N", easting: 630084, northing: 4833438 })
 * // → { system: "WGS84", latitude: 43.6425618, longitude: -79.3871429 }
 * ```
 */
export const fromUtmToWgs84 = (position: UTMCoordinate): WGS84Coordinate =>
  utmSquare(position).centre;

/**
 * The corners of the metre square a UTM position names, in WGS 84: half a metre either side of its
 * easting and northing.
 *
 * @param position - The UTM position.
 * @returns The four corners, WGS 84 latitude and longitude.
 * @throws RangeError where fromUtmToWgs84 does.
 *
 * @example
 * ```ts
 * fromUtmToWgs84Corners(utmParser.run("36U 324182 5591608").result[0]).southWest
 * // → { system: "WGS84", latitude: 50.4500988, longitude: 30.5233901 }
 * ```
 */
export const fromUtmToWgs84Corners = (
  position: UTMCoordinate,
): {
  southWest: WGS84Coordinate;
  southEast: WGS84Coordinate;
  northEast: WGS84Coordinate;
  northWest: WGS84Coordinate;
} => {
  const { fromGrid, southWest } = utmSquare(position);
  return squareCorners(fromGrid, southWest, 1);
};
