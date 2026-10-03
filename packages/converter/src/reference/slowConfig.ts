// How densely the slow suite (`pnpm test:slow`) samples Ukraine and Russia. Edit the numbers below
// and run it; nothing else needs to change.
//
// Estimates are measured on the 15-core machine this was written on: with every file running at once,
// each worker gets through about 6,000 points a second with every check. Halving a grid step
// quadruples its points; halving a spacing along an edge doubles them.
//
// Every file in ./slow runs in parallel, so the whole suite takes about as long as its slowest part.
// A grid is split into shards, one file each — 10 for Ukraine, 7 for Russia, 2 for the random points —
// and a part's time is one shard's points ÷ 6,000 a second. Raising several parts at once puts more
// files than cores to work, so expect somewhat longer than the slowest estimate.
//
// At the settings below — 10 km everywhere — the suite takes about 1 min 45 s, nearly all of it the
// MGRS square edges.

export const SLOW_SUITE = {
  /**
   * Grid step over Ukraine, in km; every check runs, UCS-2000 included. The box is about
   * 1.2 million km².
   *
   *   step      points        time
   *   10 km     12 thousand   under a second
   *   1 km      1.2 million   ~20 s
   *   500 m     4.8 million   ~1.5 min
   *   250 m     19 million    ~5.5 min
   *   150 m     54 million    ~15 min
   *   100 m     121 million   ~35 min
   *   50 m      484 million   ~2.2 h
   */
  ukraineStepKm: 10,

  /**
   * Grid step over Russia, in km; the UTM, MGRS and USNG checks. Two boxes, about 38 million km²
   * together, Chukotka beyond the antimeridian included.
   *
   *   step      points        time
   *   10 km     380 thousand  ~10 s
   *   5 km      1.5 million   ~40 s
   *   2 km      9.5 million   ~4 min
   *   1 km      38 million    ~15 min
   *   500 m     152 million   ~1 h
   */
  russiaStepKm: 10,

  /**
   * Spacing along each UTM zone edge and latitude band edge in the region, in km. Each sample is a
   * row of ten points half a metre apart straddling the edge; that across-the-edge spacing is fixed.
   *
   *   spacing   points        time
   *   10 km     160 thousand  ~25 s
   *   1 km      1.6 million   ~4 min
   *   100 m     16 million    ~40 min
   */
  zoneEdgeAlongKm: 10,

  /**
   * Spacing along each 100 km MGRS square edge in the region, in km, rows straddling the edge as
   * above.
   *
   *   spacing   points        time
   *   10 km     770 thousand  ~1.7 min
   *   5 km      1.5 million   ~3.5 min
   *   1 km      7.7 million   ~17 min
   */
  squareEdgeAlongKm: 10,

  /**
   * Spacing along the UCS-2000 zone edges at 24°, 30° and 36°E, in km, rows straddling the edge as
   * above.
   *
   *   spacing   points        time
   *   10 km     2.7 thousand  about a second
   *   1 km      27 thousand   ~5 s
   *   100 m     270 thousand  ~45 s
   */
  ucs2000EdgeAlongKm: 10,

  /**
   * Points scattered over the region from a fixed seed, split between the two random shards.
   *
   *   points        time
   *   100 thousand  ~10 s
   *   1 million     ~1.5 min
   *   5 million     ~7 min
   */
  randomPoints: 100_000,

  /** Change it to scatter a different set of random points; the same seed gives the same points. */
  randomSeed: 20261003,
};
