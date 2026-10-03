// The shapes the parser, the converter and the formatter share. A coordinate is data alone: where a
// point or square is, in one coordinate system. The format WGS 84 was written in — WGS84, WGS84R, DD,
// DDM or DMS — is kept beside the data by the parser, never in it.

/** The coordinate systems: one datum and, for the grids, one projection or grid each. */
export type CoordinateSystem = "WGS84" | "MGRS" | "USNG" | "UTM" | "UCS-2000";

/** WGS 84 latitude and longitude in decimal degrees; south and west are negative. */
export type WGS84Coordinate = {
  system: "WGS84";
  latitude: number;
  longitude: number;
};

/** An MGRS reference: a square of the UTM grid, located inside a lettered 100 km square. */
export type MGRSCoordinate = {
  system: "MGRS";
  /** UTM zone, 1-60. */
  zone: number;
  /** Latitude band letter, C-X without I and O. */
  band: string;
  /** The 100 km square: column letter, then row letter. */
  square: string;
  /** Metres east of the south-west corner of the 100 km square. */
  easting: number;
  /** Metres north of the south-west corner of the 100 km square. */
  northing: number;
  /** Side of the referenced square in metres: 100000 down to 1. */
  precision: number;
};

/** A USNG reference: the MGRS grid, read on NAD 83; its coarsest square is 10 km. */
export type USNGCoordinate = {
  system: "USNG";
  /** UTM zone, 1-60. */
  zone: number;
  /** Latitude band letter, C-X without I and O. */
  band: string;
  /** The 100 km square: column letter, then row letter. */
  square: string;
  /** Metres east of the south-west corner of the 100 km square. */
  easting: number;
  /** Metres north of the south-west corner of the 100 km square. */
  northing: number;
  /** Side of the referenced square in metres: 10000 down to 1. */
  precision: number;
};

/** A UTM position: zone, hemisphere, and metres east and north within the zone. */
export type UTMCoordinate = {
  system: "UTM";
  /** Zone, 1-60, each 6° of longitude wide. */
  zone: number;
  /** Latitude band letter, present only when the position is written with one. */
  band?: string;
  /** Which false northing applies; taken from the band when one is written. */
  hemisphere: "N" | "S";
  /** Metres east of the zone's false origin; 500000 sits on the central meridian. */
  easting: number;
  /** Metres north of the equator, or south of 10000000 for southern-hemisphere positions. */
  northing: number;
};

/** A UCS-2000 (EPSG:5562-5565) rectangular position over Ukraine. */
export type UCS2000Coordinate = {
  system: "UCS-2000";
  /** Gauss-Kruger zone, 4-7 over Ukraine, written as the leading digit of Y. */
  zone: number;
  /** X, metres north of the equator. */
  northing: number;
  /** Y with the zone prefix removed; 500000 is the central meridian of the zone. */
  easting: number;
};

/** A coordinate in any of the systems. */
export type Coordinate =
  | WGS84Coordinate
  | MGRSCoordinate
  | USNGCoordinate
  | UTMCoordinate
  | UCS2000Coordinate;
