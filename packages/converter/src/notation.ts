// What grid references are made of, for computing them. The parser and the formatter keep their own
// copies and do not export them; the round-trip tests fail if the sides stop agreeing.

/** UTM and MGRS latitude bands, 8° each from 80°S, south to north; I and O are skipped. */
export const LATITUDE_BANDS = [
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "J",
  "K",
  "L",
  "M",
  "N",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
] as const;

/** MGRS 100 km row letters, I and O skipped, repeating every 2000 km of northing. */
export const ROW_LETTERS = "ABCDEFGHJKLMNPQRSTUV";

/** Decimal places written for a degree value, about a centimetre: as many as the parser accepts. */
export const MAX_FRACTION_DIGITS = 7;
