import type { Coordinates } from "../parsers/commonParsers.ts";
import type { UCS2000Coordinate } from "../parsers/UCS2000parser.ts";
import { KRASSOWSKY_1940, localToWGS84, UCS2000_TO_WGS84, wgs84ToLocal } from "./ellipsoid.ts";
import { type Area, gridSquare } from "./area.ts";
import { type Projected, type Projection, project, unproject } from "./transverseMercator.ts";

// WGS 84 latitude/longitude to and from UCS-2000 (УСК-2000) Gauss-Kruger rectangular coordinates.
//
// Two steps, because UCS-2000 differs from WGS 84 in its datum as well as its projection:
//
//   1. datum: WGS 84 <-> Ukraine 2000, a geocentric shift of about 145 m between the WGS 84 and
//      Krassowsky 1940 ellipsoids — EPSG:5840, see ellipsoid.ts;
//   2. projection: Gauss-Kruger, six-degree zones, true scale on the central meridian, false
//      easting 500000 m — EPSG:5562-5565, zones 4-7. https://epsg.io/5564
//
// Projecting WGS 84 latitude/longitude straight onto the zone, skipping step 1, is the classic
// mistake here: it lands the point some 100-150 m off, which looks plausible on a map.

const MIN_ZONE = 4;
const MAX_ZONE = 7;
const ZONE_WIDTH = 6;

const gaussKruger = (zone: number): Projection => ({
  ellipsoid: KRASSOWSKY_1940,
  centralMeridian: zone * ZONE_WIDTH - ZONE_WIDTH / 2,
  scale: 1,
  falseEasting: 500000,
  falseNorthing: 0,
});

/**
 * The Gauss-Kruger grid of one UCS-2000 zone, seen from WGS 84: the datum shift and the projection
 * together, unrounded. Points outside the zone still project, onto the zone's extended grid.
 */
export const ucs2000Grid = (zone: number) => ({
  project: (coords: Coordinates): Projected =>
    project(wgs84ToLocal(coords, KRASSOWSKY_1940, UCS2000_TO_WGS84), gaussKruger(zone)),
  unproject: (location: Projected): Coordinates =>
    localToWGS84(unproject(location, gaussKruger(zone)), KRASSOWSKY_1940, UCS2000_TO_WGS84),
});

/** The UCS-2000 zone a WGS 84 point falls in. Throws a RangeError outside zones 4-7. */
export const ucs2000ZoneOf = (coords: Coordinates) => {
  const local = wgs84ToLocal(coords, KRASSOWSKY_1940, UCS2000_TO_WGS84);
  const zone = Math.floor(local.longitude / ZONE_WIDTH) + 1;

  if (zone < MIN_ZONE || zone > MAX_ZONE) {
    throw new RangeError(
      `UCS-2000 is defined in zones ${MIN_ZONE}-${MAX_ZONE}, longitudes ${(MIN_ZONE - 1) * ZONE_WIDTH}°E to ${MAX_ZONE * ZONE_WIDTH}°E, but ${coords.longitude}° falls in zone ${zone}`,
    );
  }
  return zone;
};

/** WGS 84 to UCS-2000, rounded to the whole metre the rectangular coordinates are written in. */
export const toUCS2000 = (coords: Coordinates): UCS2000Coordinate => {
  const zone = ucs2000ZoneOf(coords);
  const { easting, northing } = ucs2000Grid(zone).project(coords);
  return { zone, northing: Math.round(northing), easting: Math.round(easting) };
};

/**
 * The square a UCS-2000 reference names, in WGS 84: everything within half a metre of X and Y.
 * Each corner goes through the datum shift on its own, as any point would.
 */
export const ucs2000Area = ({ zone, northing, easting }: UCS2000Coordinate): Area =>
  gridSquare(ucs2000Grid(zone).unproject, { easting: easting - 0.5, northing: northing - 0.5 }, 1);

/** UCS-2000 to WGS 84, the centre of the referenced square. */
export const fromUCS2000 = (reference: UCS2000Coordinate): Coordinates =>
  ucs2000Area(reference).centre;

/** X, then Y with the zone digit in front: "5593954 6324226". */
export const formatUCS2000 = ({ zone, northing, easting }: UCS2000Coordinate) =>
  `${northing} ${zone}${String(easting).padStart(6, "0")}`;
