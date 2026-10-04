import type { WGS84Coordinate } from "@coordinate-parser/types";
import type { Box } from "./gridOverlay.ts";

// Where UCS-2000 means something, for the map's layers and the warning beside a converted value.
// The converter computes across each zone's whole six-degree strip, 18°E to 42°E; but the EPSG:5840
// datum shift behind it was fitted to Ukraine, so outside Ukraine the value is not to be trusted.

const ZONE_WIDTH = 6;

/**
 * Where each zone is defined: EPSG's area of use for the zone CRSs, EPSG:5562-5565. These are
 * bounding boxes of the part of Ukraine each zone covers, not the border itself.
 */
export const UCS2000_ZONE_AREAS: (Box & { zone: number })[] = [
  { zone: 4, west: 22.15, south: 47.95, east: 24, north: 51.66 },
  { zone: 5, west: 24, south: 45.1, east: 30, north: 51.96 },
  { zone: 6, west: 30, south: 43.18, east: 36, north: 52.38 },
  { zone: 7, west: 36, south: 43.43, east: 40.18, north: 50.44 },
];

/** Each zone's whole six-degree strip, as far towards the poles as a web map reaches. */
export const UCS2000_STRIPS: (Box & { zone: number })[] = UCS2000_ZONE_AREAS.map(({ zone }) => ({
  zone,
  west: (zone - 1) * ZONE_WIDTH,
  south: -85,
  east: zone * ZONE_WIDTH,
  north: 85,
}));

/** Whether a point lies in UCS-2000's area of use: inside the EPSG box of the zone it falls in. */
export const insideUcs2000AreaOfUse = ({ latitude, longitude }: WGS84Coordinate) => {
  const area = UCS2000_ZONE_AREAS.find(
    ({ zone }) => zone === Math.floor(longitude / ZONE_WIDTH) + 1,
  );
  return (
    area !== undefined &&
    latitude >= area.south &&
    latitude <= area.north &&
    longitude >= area.west &&
    longitude <= area.east
  );
};
