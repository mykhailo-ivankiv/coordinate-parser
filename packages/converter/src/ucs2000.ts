import type { UCS2000Coordinate, WGS84Coordinate } from "@coordinate-toolkit/types";
import type { Coordinates } from "./coordinates.ts";
import { KRASSOWSKY_1940, localToWGS84, UCS2000_TO_WGS84, wgs84ToLocal } from "./ellipsoid.ts";
import { squareCentre, gridSquare, toDeclaredPrecision } from "./area.ts";
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

/**
 * A WGS 84 point as UCS-2000 rectangular coordinates: shifted onto the Ukraine 2000 datum, projected
 * onto its Gauss-Kruger zone, and rounded to the whole metre.
 *
 * @param point - The point, WGS 84 latitude and longitude.
 * @returns The UCS-2000 position.
 * @throws RangeError outside zones 4-7, 18°E to 42°E. Between Ukraine and the zone edges it still
 * converts, though the datum shift was fitted to Ukraine only.
 *
 * @example
 * ```ts
 * fromWgs84ToUcs2000({ system: "WGS84", latitude: 50.4501, longitude: 30.5234 })
 * // → { system: "UCS-2000", zone: 6, northing: 5593954, easting: 324226 }
 * ```
 *
 * @group UCS-2000
 */
export const fromWgs84ToUcs2000 = (point: WGS84Coordinate): UCS2000Coordinate => {
  const coords = toDeclaredPrecision(point);
  const zone = ucs2000ZoneOf(coords);
  const { easting, northing } = ucs2000Grid(zone).project(coords);
  return { system: "UCS-2000", zone, northing: Math.round(northing), easting: Math.round(easting) };
};

/**
 * UCS-2000 rectangular coordinates as a WGS 84 point: the centre of the metre square they name,
 * taken back through the projection and the datum shift.
 *
 * @param position - The UCS-2000 position.
 * @returns The point, WGS 84 latitude and longitude.
 *
 * @example
 * ```ts
 * fromUcs2000ToWgs84({ system: "UCS-2000", zone: 6, northing: 5591000, easting: 325000 })
 * // → { system: "WGS84", latitude: 50.4238014, longitude: 30.5356689 }
 * ```
 *
 * @group UCS-2000
 */
export const fromUcs2000ToWgs84 = ({
  zone,
  northing,
  easting,
}: UCS2000Coordinate): WGS84Coordinate =>
  squareCentre(
    ucs2000Grid(zone).unproject,
    { easting: easting - 0.5, northing: northing - 0.5 },
    1,
  );

/**
 * The metre square a UCS-2000 position names, in WGS 84, its centre and corners: half a metre either side of
 * X and Y, each corner taken through the datum shift on its own, as any point would be.
 *
 * @param position - The UCS-2000 position.
 * @returns The centre and the four corners, WGS 84 latitude and longitude.
 *
 * @example
 * ```ts
 * fromUcs2000ToWgs84Square({ system: "UCS-2000", zone: 6, northing: 5593954, easting: 324226 }).southWest
 * // → { system: "WGS84", latitude: 50.4500965, longitude: 30.5233959 }
 * ```
 *
 * @group UCS-2000
 */
export const fromUcs2000ToWgs84Square = ({
  zone,
  northing,
  easting,
}: UCS2000Coordinate): {
  centre: WGS84Coordinate;
  southWest: WGS84Coordinate;
  southEast: WGS84Coordinate;
  northEast: WGS84Coordinate;
  northWest: WGS84Coordinate;
} =>
  gridSquare(ucs2000Grid(zone).unproject, { easting: easting - 0.5, northing: northing - 0.5 }, 1);
