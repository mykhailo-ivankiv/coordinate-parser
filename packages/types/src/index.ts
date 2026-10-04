// The shapes the parser, the converter and the formatter share. A coordinate is data alone: where a
// point or square is, in one coordinate system. The format WGS 84 was written in — WGS84, WGS84R, DD,
// DDM or DMS — is kept beside the data by the parser, never in it.

/** The coordinate systems: one datum and, for the grids, one projection or grid each. */
export type CoordinateSystem = "WGS84" | "MGRS" | "USNG" | "UTM" | "UCS-2000";

/** A coordinate in any of the systems. */
export type Coordinate = WGS84Coordinate | MGRSCoordinate | UTMCoordinate | UCS2000Coordinate;

/** WGS 84 latitude and longitude in decimal degrees; south and west are negative. */
export type WGS84Coordinate = {
  system: "WGS84";
  latitude: number;
  longitude: number;
};

/**
 * An MGRS or USNG reference: a square of the UTM grid, located inside a lettered 100 km square. USNG
 * is the MGRS grid written another way, with at least one digit per axis.
 */
export type MGRSCoordinate = {
  system: "MGRS" | "USNG";
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
  /** Side of the referenced square in metres: 100000 down to 1; for USNG, 10000 at the coarsest. */
  precision: 1 | 10 | 100 | 1000 | 10000 | 100000;
};

/** A USNG reference: the same data as MGRS, with `system: "USNG"`. */
export type USNGCoordinate = MGRSCoordinate;

/** A UTM position: zone, hemisphere, and metres east and north within the zone. */
export type UTMCoordinate = {
  system: "UTM";
  /** Zone, 1-60, each 6° of longitude wide. */
  zone: number;
  /** Latitude band letter, C-X without I and O; present only when the position is written with one. */
  band?:
    | "C"
    | "D"
    | "E"
    | "F"
    | "G"
    | "H"
    | "J"
    | "K"
    | "L"
    | "M"
    | "N"
    | "P"
    | "Q"
    | "R"
    | "S"
    | "T"
    | "U"
    | "V"
    | "W"
    | "X";
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
