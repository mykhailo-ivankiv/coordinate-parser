import type { Coordinates } from "../parsers/commonParsers.ts";
import { LATITUDE_BANDS } from "../parsers/gridReference.ts";
import type { UTMCoordinate } from "../parsers/UTMparser.ts";
import { WGS84_ELLIPSOID } from "./ellipsoid.ts";
import { toDeclaredPrecision } from "./precision.ts";
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
// Band X is the one exception to the eight-degree rule: it runs 72-84°N, twelve degrees.
const LAST_BAND_NORTH = UTM_NORTH_LIMIT;

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

/** Southern and northern edge of a latitude band, degrees. */
export const bandLimits = (band: string): [number, number] => {
  const south = (LATITUDE_BANDS.indexOf(band) - 10) * BAND_HEIGHT;
  return [south, band === "X" ? LAST_BAND_NORTH : south + BAND_HEIGHT];
};

export const hemisphereOfLatitude = (latitude: number): "N" | "S" => (latitude < 0 ? "S" : "N");

// Zones are six degrees wide counted east from the antimeridian, with the exceptions NGA.STND.0037
// carves out around Norway and Svalbard so that no country is split needlessly.
export const zoneOf = ({ latitude, longitude }: Coordinates) => {
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
 * `toUTM`, because MGRS truncates and must not see a value that has already been rounded up.
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

/** WGS 84 to UTM, rounded to the whole metre that UTM references are written in. */
export const toUTM = (coords: Coordinates): UTMCoordinate => {
  const { zone, hemisphere, band, easting, northing } = projectToUTM(coords);
  return { zone, band, hemisphere, easting: Math.round(easting), northing: Math.round(northing) };
};

export const unprojectUTM = (location: Projected, zone: number, hemisphere: "N" | "S") =>
  unproject(location, utmProjection(zone, hemisphere));

// A written reference is rounded to the metre, so a point on a band edge can land a hair across it.
// About ten metres of slack absorbs that and still catches a band that is simply wrong.
export const BAND_TOLERANCE = 0.0001;

/** UTM to WGS 84. When the reference names a latitude band, the result is checked against it. */
export const fromUTM = ({
  zone,
  hemisphere,
  band,
  easting,
  northing,
}: UTMCoordinate): Coordinates => {
  const coords = unprojectUTM({ easting, northing }, zone, hemisphere);

  if (band !== undefined) {
    const [south, north] = bandLimits(band);
    if (coords.latitude < south - BAND_TOLERANCE || coords.latitude > north + BAND_TOLERANCE) {
      throw new RangeError(
        `UTM band ${band} spans ${south}° to ${north}°, but northing ${northing} lies at ${coords.latitude.toFixed(4)}°`,
      );
    }
  }

  return toDeclaredPrecision(coords);
};

export const formatUTM = ({ zone, band, hemisphere, easting, northing }: UTMCoordinate) =>
  `${zone}${band ?? hemisphere} ${easting} ${northing}`;
