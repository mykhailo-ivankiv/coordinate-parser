// What the written forms are made of, on the writing side. The parser package keeps its own copies
// for reading and does not export them; the round-trip tests — every value this package writes is
// read back by the parser — fail if the two sides stop agreeing.

/** UTM and MGRS latitude bands, 8° each from 80°S, south to north; I and O are skipped. */
export const LATITUDE_BANDS = "CDEFGHJKLMNPQRSTUVWX";

/** MGRS 100 km row letters, I and O skipped, repeating every 2000 km of northing. */
export const ROW_LETTERS = "ABCDEFGHJKLMNPQRSTUV";

/** Digits per axis in the finest MGRS or USNG reference: 5, a 1 m square. */
export const MAX_DIGITS_PER_AXIS = 5;

/** Decimal places written for a degree value, about a centimetre: as many as the parser accepts. */
export const MAX_FRACTION_DIGITS = 7;

export const DEGREE_SIGN = "°";
