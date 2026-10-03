import {
  type GeoJSONSource,
  LngLatBounds,
  Map,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { type ReactNode, useEffect, useRef } from "react";
import {
  type Area,
  gridZones,
  mgrsGrid,
  spacingFor,
  toDeclaredPrecision,
  type Box,
  ucs2000Zones,
  zoneSeams,
} from "@coordinate-parser/converter";
import { formatUSNG } from "@coordinate-parser/formatter";
import type { MGRSCoordinate, WGS84Coordinate } from "@coordinate-parser/types";

// OpenFreeMap: free vector tiles from OpenStreetMap data, no API key and no registration.
// https://openfreemap.org
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// MapLibre looks for its worker next to its own module, which is not where Vite serves it from once
// the library is pre-bundled or hashed into the build. Vite builds the worker itself and says where.
setWorkerUrl(workerUrl);

const KYIV: [number, number] = [30.5234, 50.4501];

// Each layer keeps its own hue — green for what was typed in, red for what it converts to, blue for
// the UCS-2000 zones, teal and violet for the grids — in soft pastels that sit with the article's
// diagrams: the result takes the article's terracotta accent, the rest are pitched to match it on
// the paper background. Pastels fade easily over a map, so lines are drawn near full strength and
// layers are told apart by hue, weight and dash.
const PAPER = "#faf8f4";
export const ACCENT = "#d97757";

export const INPUT_COLOUR = "#7fb38a";
export const OUTPUT_COLOUR = ACCENT;
export const ZONE_COLOUR = "#8aa6d6";
export const UTM_COLOUR = "#72b5b3";
export const MGRS_COLOUR = "#aa97d1";

// Line strengths: the finer grid lines, the structure, and what should stand out.
const FAINT = 0.55;
const STRUCTURE = 0.85;
const STRONG = 1;

/** A colour at a strength, as an 8-digit hex the legend's CSS can take. */
const withAlpha = (colour: string, opacity: number) =>
  `${colour}${Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0")}`;

export type OutputSquare = {
  area: Area;
  /** The reference written on the square, when there are several to tell apart. */
  label?: string;
  /** The square holding the input's centre: the one the conversion actually returns. */
  primary: boolean;
};

type MapData = {
  /** The stored point: the centre of whatever the input designates. */
  centre: WGS84Coordinate | null;
  /** The zone the input names, when it is a grid reference. */
  inputArea: Area | null;
  /** The squares the input converts to; several when the input zone reaches more than one. */
  outputSquares: OutputSquare[];
  /** Converted values that are points rather than squares: the WGS 84 latitude and longitude. */
  outputPoints: WGS84Coordinate[];
  /** Which reference layers to draw beneath the results. */
  layers: MapLayers;
};

export type MapLayers = {
  /** EPSG's area of use for UCS-2000 zones 4-7: where a UCS-2000 value can be trusted. */
  ucs2000Areas: boolean;
  /** The strips 18°-42°E: where the converter computes UCS-2000 at all. */
  ucs2000Strips: boolean;
  /** The UTM grid zones, "36U" and the rest. */
  utmZones: boolean;
  /** The MGRS grid, which USNG shares: 100 km squares, finer lines as the map zooms in. */
  mgrsGrid: boolean;
};

// Taken from maplibre's own signature, so the project needs no separate GeoJSON type package.
type FeatureCollection = Exclude<Parameters<GeoJSONSource["setData"]>[0], string>;

// MapLibre takes [longitude, latitude]; anything with the two numbers will do, a zone's middle too.
const lngLat = ({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}): [number, number] => [longitude, latitude];

const collection = (features: FeatureCollection["features"]): FeatureCollection => ({
  type: "FeatureCollection",
  features,
});

// The ring follows the grid, not lines of latitude and longitude: a square far from its central
// meridian is drawn slightly rotated, and the edges of a large one as the curves they are.
const polygons = (squares: { area: Area; primary?: boolean }[]) =>
  collection(
    squares.flatMap(({ area: { outline }, primary = true }) =>
      outline === null
        ? []
        : [
            {
              type: "Feature" as const,
              properties: { primary },
              geometry: { type: "Polygon" as const, coordinates: [outline.map(lngLat)] },
            },
          ],
    ),
  );

const points = (
  items: { at: { latitude: number; longitude: number }; label?: string; primary?: boolean }[],
) =>
  collection(
    items.map(({ at, label, primary = true }) => ({
      type: "Feature" as const,
      properties: { label: label ?? "", primary },
      geometry: { type: "Point" as const, coordinates: lngLat(at) },
    })),
  );

// The closest the view zooms to on its own; 17 still shows streets. Closer is the user's call.
const MAX_FIT_ZOOM = 17;

// Below this many pixels across, a square is drawn as a ring at its centre instead: a metre square,
// every UTM and UCS-2000 reference, is two or three pixels at street level and would otherwise look
// like nothing was drawn at all. Zooming in turns the ring back into the square.
const MIN_SQUARE_PIXELS = 8;

// MapLibre's zoom 0 shows the equator as one 512 px tile.
const metresPerPixel = (latitude: number, zoom: number) =>
  (40075016.686 * Math.cos((latitude * Math.PI) / 180)) / (512 * 2 ** zoom);

const tooSmall = (area: Area, zoom: number) =>
  area.size / metresPerPixel(area.centre.latitude, zoom) < MIN_SQUARE_PIXELS;

// The UCS-2000 zones as two layers: where each is defined, and the whole strip it computes across.
type ZoneArea = Box & { zone: number };
const UCS2000_ZONE_AREAS: ZoneArea[] = ucs2000Zones().map(({ zone, areaOfUse }) => ({
  zone,
  ...areaOfUse,
}));
const UCS2000_STRIPS: ZoneArea[] = ucs2000Zones().map(({ zone, strip }) => ({ zone, ...strip }));

// A zone's edges are meridians and parallels, which are straight lines on a web map, so its four
// corners are its whole outline.
const zonePolygons = (zones: ZoneArea[]) =>
  collection(
    zones.map(({ zone, west, south, east, north }) => ({
      type: "Feature" as const,
      properties: { zone },
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ],
        ],
      },
    })),
  );

const zoneLabels = (zones: ZoneArea[]) =>
  points(
    zones.map(({ zone, west, south, east, north }) => ({
      at: { latitude: (south + north) / 2, longitude: (west + east) / 2 },
      label: `УСК-2000 · зона ${zone}`,
    })),
  );

// A strip runs pole to pole, so a single label in its middle would sit on the equator, far off
// screen. One every ten degrees keeps one in view wherever the map is; MapLibre hides any that clash.
const stripLabels = (strips: ZoneArea[]) =>
  points(
    strips.flatMap(({ zone, west, east }) =>
      Array.from({ length: 15 }, (_, index) => ({
        at: { latitude: -70 + index * 10 + 5, longitude: (west + east) / 2 },
        label: `смуга зони ${zone} · ${west}–${east}° сх. д.`,
      })),
    ),
  );

// Around Ukraine: the strips run pole to pole, so fitting all of them would show the whole globe.
const STRIPS_VIEW = new LngLatBounds([18, 40], [42, 57]);

const zoneBounds = (zones: ZoneArea[]) =>
  new LngLatBounds(
    [Math.min(...zones.map(({ west }) => west)), Math.min(...zones.map(({ south }) => south))],
    [Math.max(...zones.map(({ east }) => east)), Math.max(...zones.map(({ north }) => north))],
  );

// A UTM zone is six degrees wide, 512 · 6/360 · 2^zoom pixels at MapLibre's scale: about 20 px at
// zoom 1.2, and 50 px — room for "36U" — at zoom 2.6. Its width does not depend on latitude, so here
// a zoom threshold says the same as a pixel one.
const UTM_LINES_MIN_ZOOM = 1.2;
const UTM_LABELS_MIN_ZOOM = 2.6;

const SOURCES = [
  "strips",
  "strip-labels",
  "zones",
  "zone-labels",
  "utm-zones",
  "utm-zone-labels",
  "mgrs-seams",
  "mgrs-lines",
  "mgrs-labels",
  "input-area",
  "output-squares",
  "output-labels",
  "output-points",
  "centre",
];

const addLayers = (map: Map) => {
  for (const id of SOURCES) map.addSource(id, { type: "geojson", data: collection([]) });

  // Beneath everything else: a backdrop for the squares, not something to compete with them. The
  // strips are fainter still, beneath the areas of use they contain.
  map.addLayer({
    id: "strips-fill",
    type: "fill",
    source: "strips",
    paint: { "fill-color": ZONE_COLOUR, "fill-opacity": 0.06 },
  });
  map.addLayer({
    id: "strips-line",
    type: "line",
    source: "strips",
    paint: {
      "line-color": ZONE_COLOUR,
      "line-opacity": STRUCTURE,
      "line-width": 1,
      "line-dasharray": [1, 2],
    },
  });
  map.addLayer({
    id: "strip-labels",
    type: "symbol",
    source: "strip-labels",
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
    },
    paint: {
      "text-color": ZONE_COLOUR,
      "text-opacity": 0.55,
      "text-halo-color": PAPER,
      "text-halo-width": 1.5,
    },
  });
  map.addLayer({
    id: "zones-fill",
    type: "fill",
    source: "zones",
    paint: { "fill-color": ZONE_COLOUR, "fill-opacity": 0.12 },
  });
  map.addLayer({
    id: "zones-line",
    type: "line",
    source: "zones",
    paint: {
      "line-color": ZONE_COLOUR,
      "line-opacity": STRONG,
      "line-width": 1.2,
      "line-dasharray": [4, 3],
    },
  });
  map.addLayer({
    id: "zone-labels",
    type: "symbol",
    source: "zone-labels",
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
    },
    paint: { "text-color": ZONE_COLOUR, "text-halo-color": PAPER, "text-halo-width": 1.5 },
  });

  // The grids: lines only, beneath the results, each with its own labels.
  map.addLayer({
    id: "utm-zones",
    type: "line",
    source: "utm-zones",
    minzoom: UTM_LINES_MIN_ZOOM,
    paint: { "line-color": UTM_COLOUR, "line-opacity": STRUCTURE, "line-width": 1.2 },
  });
  // The UTM zone edges, where one zone's MGRS grid gives way to the next and the lines break.
  map.addLayer({
    id: "mgrs-seams",
    type: "line",
    source: "mgrs-seams",
    paint: {
      "line-color": MGRS_COLOUR,
      "line-opacity": STRONG,
      "line-width": 1.5,
      "line-dasharray": [6, 4],
    },
  });
  map.addLayer({
    id: "mgrs-lines",
    type: "line",
    source: "mgrs-lines",
    paint: {
      "line-color": MGRS_COLOUR,
      "line-width": ["case", ["get", "major"], 1.2, 0.8],
      "line-opacity": ["case", ["get", "major"], STRUCTURE, FAINT],
    },
  });
  map.addLayer({
    id: "utm-zone-labels",
    type: "symbol",
    source: "utm-zone-labels",
    minzoom: UTM_LABELS_MIN_ZOOM,
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 13,
    },
    paint: {
      "text-color": UTM_COLOUR,
      "text-opacity": STRONG,
      "text-halo-color": PAPER,
      "text-halo-width": 1.5,
    },
  });
  map.addLayer({
    id: "mgrs-labels",
    type: "symbol",
    source: "mgrs-labels",
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
    },
    paint: {
      "text-color": MGRS_COLOUR,
      "text-opacity": 0.6,
      "text-halo-color": PAPER,
      "text-halo-width": 1.5,
    },
  });

  map.addLayer({
    id: "input-area-fill",
    type: "fill",
    source: "input-area",
    paint: { "fill-color": INPUT_COLOUR, "fill-opacity": 0.16 },
  });
  map.addLayer({
    id: "output-squares-fill",
    type: "fill",
    source: "output-squares",
    paint: { "fill-color": OUTPUT_COLOUR, "fill-opacity": 0.18 },
  });
  // The square the conversion returns is drawn solid; the others the input zone also reaches,
  // dashed: the point could be in any of them, but the stored centre is in the solid one.
  map.addLayer({
    id: "output-squares-other",
    type: "line",
    source: "output-squares",
    filter: ["==", ["get", "primary"], false],
    paint: {
      "line-color": OUTPUT_COLOUR,
      "line-opacity": 0.5,
      "line-width": 1.5,
      "line-dasharray": [4, 3],
    },
  });
  map.addLayer({
    id: "output-squares-primary",
    type: "line",
    source: "output-squares",
    filter: ["==", ["get", "primary"], true],
    paint: { "line-color": OUTPUT_COLOUR, "line-width": 2 },
  });
  map.addLayer({
    id: "input-area-line",
    type: "line",
    source: "input-area",
    paint: { "line-color": INPUT_COLOUR, "line-opacity": STRONG, "line-width": 2 },
  });
  map.addLayer({
    id: "output-labels",
    type: "symbol",
    source: "output-labels",
    layout: {
      "text-field": ["get", "label"],
      // One of the fonts the OpenFreeMap style serves glyphs for.
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
    },
    paint: { "text-color": OUTPUT_COLOUR, "text-halo-color": PAPER, "text-halo-width": 1.5 },
  });
  // A red ring around the green centre: the converted point sits exactly on the input's centre, so
  // a filled dot would only hide it.
  map.addLayer({
    id: "output-points",
    type: "circle",
    source: "output-points",
    paint: {
      "circle-radius": 10,
      "circle-color": "rgba(0, 0, 0, 0)",
      "circle-stroke-color": OUTPUT_COLOUR,
      "circle-stroke-width": 2,
      // A ring standing in for one of the other squares the input zone reaches, not the result.
      "circle-stroke-opacity": ["case", ["get", "primary"], 1, 0.45],
    },
  });
  map.addLayer({
    id: "centre",
    type: "circle",
    source: "centre",
    paint: {
      // Small enough that a metre square around it stays visible at the closest zoom.
      "circle-radius": 3.5,
      "circle-color": INPUT_COLOUR,
      "circle-stroke-color": PAPER,
      "circle-stroke-width": 1.5,
    },
  });
};

const setData = (map: Map, id: string, data: FeatureCollection) =>
  (map.getSource(id) as GeoJSONSource).setData(data);

// Every UTM grid zone, outlined: a box of meridians and parallels, straight on a web map.
const UTM_ZONES = gridZones();
const utmZoneOutlines = collection(
  UTM_ZONES.map(({ west, south, east, north }) => ({
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    },
  })),
);
const utmZoneLabels = points(
  UTM_ZONES.map(({ designator, west, south, east, north }) => ({
    at: { latitude: (south + north) / 2, longitude: (west + east) / 2 },
    label: designator,
  })),
);

const mgrsSeams = collection(
  zoneSeams().map((seam) => ({
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: seam.map(lngLat) },
  })),
);

const NO_MGRS = { lines: collection([]), labels: collection([]), seams: collection([]) };

// The grids follow the scale by how big a cell comes out on screen, not by zoom level, since a
// cell's size in pixels also depends on latitude. Below these sizes the lines or labels would only
// be clutter.
const MGRS_MIN_SQUARE_PIXELS = 40; // 100 km squares, to draw the grid at all
const MGRS_LABEL_PIXELS = 120; // 100 km squares, to name them

// A grid cell named for the map: at 100 km the square with its grid zone, "36U UA"; finer, the square
// and the digits at the grid's precision, "UA 24 91" — the zone is plain from the 100 km labels, and
// would only crowd the small cells. A 100 km reference has no digits, so its empty groups are dropped.
const cellLabel = (reference: MGRSCoordinate) => {
  const [zoneAndBand, ...rest] = formatUSNG({ ...reference, system: "USNG" })
    .split(" ")
    .filter(Boolean);
  return reference.precision === 100_000 ? `${zoneAndBand} ${rest.join(" ")}` : rest.join(" ");
};

/** The MGRS grid for the map's current view, at a spacing that suits its scale. */
const mgrsForView = (map: Map) => {
  const resolution = metresPerPixel(map.getCenter().lat, map.getZoom());
  const squarePixels = 100_000 / resolution;
  if (squarePixels < MGRS_MIN_SQUARE_PIXELS) return NO_MGRS;

  const bounds = map.getBounds();
  const view = {
    west: Math.max(-180, bounds.getWest()),
    east: Math.min(180, bounds.getEast()),
    south: Math.max(-90, bounds.getSouth()),
    north: Math.min(90, bounds.getNorth()),
  };
  // A view too wide for the fine lines still gets the 100 km squares.
  const grid = mgrsGrid(view, spacingFor(resolution)) ??
    mgrsGrid(view, 100_000) ?? { lines: [], labels: [] };

  return {
    lines: collection(
      grid.lines.map(({ path, major }) => ({
        type: "Feature" as const,
        properties: { major },
        geometry: { type: "LineString" as const, coordinates: path.map(lngLat) },
      })),
    ),
    labels: points(
      squarePixels >= MGRS_LABEL_PIXELS
        ? grid.labels.map(({ at, reference }) => ({ at, label: cellLabel(reference) }))
        : [],
    ),
    seams: mgrsSeams,
  };
};

/** Draws the grids that are switched on; the MGRS one is redrawn whenever the view moves. */
const drawGrids = (map: Map, { utmZones, mgrsGrid: showMgrs }: MapLayers) => {
  setData(map, "utm-zones", utmZones ? utmZoneOutlines : collection([]));
  setData(map, "utm-zone-labels", utmZones ? utmZoneLabels : collection([]));
  const mgrs = showMgrs ? mgrsForView(map) : NO_MGRS;
  setData(map, "mgrs-seams", mgrs.seams);
  setData(map, "mgrs-lines", mgrs.lines);
  setData(map, "mgrs-labels", mgrs.labels);
};

/**
 * Fills the sources for the current zoom: squares big enough to see as polygons, the rest as rings.
 * Returns which squares came out as rings, so a zoom that changes nothing can skip the redraw.
 */
const draw = (map: Map, { centre, inputArea, outputSquares, outputPoints, layers }: MapData) => {
  drawGrids(map, layers);

  const strips = layers.ucs2000Strips ? UCS2000_STRIPS : [];
  setData(map, "strips", zonePolygons(strips));
  setData(map, "strip-labels", stripLabels(strips));
  const zones = layers.ucs2000Areas ? UCS2000_ZONE_AREAS : [];
  setData(map, "zones", zonePolygons(zones));
  setData(map, "zone-labels", zoneLabels(zones));

  setData(map, "centre", points(centre === null ? [] : [{ at: centre }]));
  setData(map, "input-area", polygons(inputArea ? [{ area: inputArea }] : []));

  const zoom = map.getZoom();
  const visible = outputSquares.filter(({ area }) => !tooSmall(area, zoom));
  const rings = outputSquares.filter(({ area }) => tooSmall(area, zoom));
  setData(map, "output-squares", polygons(visible));
  setData(
    map,
    "output-points",
    points([
      ...outputPoints.map((at) => ({ at })),
      ...rings.map(({ area, primary }) => ({ at: area.centre, primary })),
    ]),
  );
  // Labels only on squares drawn as squares: on a pile of rings they would stack on one spot.
  setData(
    map,
    "output-labels",
    points(
      visible.flatMap(({ area, label }) =>
        label === undefined ? [] : [{ at: area.centre, label }],
      ),
    ),
  );

  return outputSquares.map(({ area }) => tooSmall(area, zoom)).join();
};

/** Moves the view onto the point and every square around it. */
const fit = (map: Map, { centre, inputArea, outputSquares }: MapData) => {
  if (centre === null) return;

  const bounds = new LngLatBounds(lngLat(centre), lngLat(centre));
  // The outline, not just the corners: a curved edge bulges past the line between them.
  for (const { outline } of [
    ...(inputArea ? [inputArea] : []),
    ...outputSquares.map(({ area }) => area),
  ]) {
    for (const vertex of outline ?? []) bounds.extend(lngLat(vertex));
  }

  map.fitBounds(bounds, { padding: 60, maxZoom: MAX_FIT_ZOOM, duration: 600 });
};

const Swatch = ({
  colour,
  dashed = false,
  dotted = false,
  strength = 1,
  fill = true,
}: {
  colour: string;
  dashed?: boolean;
  dotted?: boolean;
  /** How strong the line is drawn on the map, so the legend shows it the same. */
  strength?: number;
  fill?: boolean;
}) => (
  <span
    className="inline-block h-3 w-5 align-middle"
    style={{
      backgroundColor: fill ? withAlpha(colour, 0.15 * strength) : "transparent",
      border: `2px ${dotted ? "dotted" : dashed ? "dashed" : "solid"} ${withAlpha(colour, strength)}`,
    }}
  />
);

/** A legend line that is also the switch for its layer. */
const LayerToggle = ({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) => (
  <li>
    <label className="flex cursor-pointer items-center gap-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  </li>
);

const Legend = ({
  layers,
  onLayersChange,
}: {
  layers: MapLayers;
  onLayersChange: (layers: MapLayers) => void;
}) => (
  <ul className="absolute bottom-8 left-2 flex flex-col gap-1 rounded-lg border border-line bg-white/95 p-2.5 text-xs text-ink shadow-sm backdrop-blur">
    <li>
      <Swatch colour={INPUT_COLOUR} strength={STRONG} /> введене значення
    </li>
    <li>
      <Swatch colour={OUTPUT_COLOUR} /> результат — містить центр
    </li>
    <li>
      <span
        className="inline-block h-3 w-3 rounded-full align-middle"
        style={{ border: `2px solid ${OUTPUT_COLOUR}` }}
      />{" "}
      результат-точка: WGS 84, або квадрат, замалий для цього масштабу
    </li>
    <li>
      <Swatch colour={OUTPUT_COLOUR} dashed strength={0.5} /> інші квадрати, куди сягає вхідна зона
    </li>
    <li className="mt-1 border-t pt-1 opacity-60">шари</li>
    <LayerToggle
      checked={layers.utmZones}
      onChange={(utmZones) => onLayersChange({ ...layers, utmZones })}
    >
      <Swatch colour={UTM_COLOUR} strength={STRUCTURE} fill={false} /> зони сітки UTM
    </LayerToggle>
    <LayerToggle
      checked={layers.mgrsGrid}
      onChange={(mgrsGrid) => onLayersChange({ ...layers, mgrsGrid })}
    >
      <Swatch colour={MGRS_COLOUR} strength={STRUCTURE} fill={false} /> сітка MGRS / USNG
    </LayerToggle>
    {layers.mgrsGrid && (
      <li className="pl-5">
        <Swatch colour={MGRS_COLOUR} dashed strength={STRONG} fill={false} /> межа зон, де сітка
        переривається
      </li>
    )}
    <LayerToggle
      checked={layers.ucs2000Areas}
      onChange={(ucs2000Areas) => onLayersChange({ ...layers, ucs2000Areas })}
    >
      <Swatch colour={ZONE_COLOUR} dashed strength={STRONG} /> зона визначення УСК-2000
    </LayerToggle>
    <LayerToggle
      checked={layers.ucs2000Strips}
      onChange={(ucs2000Strips) => onLayersChange({ ...layers, ucs2000Strips })}
    >
      <Swatch colour={ZONE_COLOUR} dotted strength={STRUCTURE} /> смуги, де рахується УСК-2000
    </LayerToggle>
  </ul>
);

type Picking = {
  /** While true, a click on the map picks a point instead of doing nothing. */
  picking: boolean;
  /** Called with the point clicked while picking. */
  onPick: (coords: WGS84Coordinate) => void;
  /**
   * Whether a change of data moves the view onto it. False after a point was picked on the map: the
   * user chose it where they were looking, so the view stays put and only the drawing changes.
   */
  fitView: boolean;
  /** Called when a layer is switched from the legend. */
  onLayersChange: (layers: MapLayers) => void;
};

export const ConverterMap = ({
  picking,
  onPick,
  fitView,
  onLayersChange,
  ...data
}: MapData & Picking) => {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const loaded = useRef(false);
  // What the map should show once its style has loaded; the load and zoom handlers read it here.
  const latest = useRef(data);
  // Which squares are currently drawn as rings, to tell whether a zoom needs a redraw.
  const drawn = useRef("");
  // Read by the click handler, which is bound once when the map is created.
  const pick = useRef({ picking, onPick });

  useEffect(() => {
    if (container.current === null) return;

    const instance = new Map({
      container: container.current,
      style: STYLE_URL,
      center: KYIV,
      zoom: 5,
    });
    instance.addControl(new NavigationControl(), "top-right");
    instance.on("load", () => {
      addLayers(instance);
      loaded.current = true;
      drawn.current = draw(instance, latest.current);
      fit(instance, latest.current);
    });
    // Squares switch between ring and polygon as they cross the size threshold. The check is cheap;
    // the redraw only happens on the frames where something actually crosses it.
    instance.on("zoom", () => {
      if (!loaded.current) return;
      const rings = latest.current.outputSquares
        .map(({ area }) => tooSmall(area, instance.getZoom()))
        .join();
      if (rings !== drawn.current) drawn.current = draw(instance, latest.current);
    });
    // The MGRS grid covers only the view, so it follows the view.
    instance.on("moveend", () => {
      if (loaded.current && latest.current.layers.mgrsGrid)
        drawGrids(instance, latest.current.layers);
    });
    instance.on("click", ({ lngLat }) => {
      if (!pick.current.picking) return;
      // wrap(): a map panned past the antimeridian reports longitudes beyond ±180.
      const { lat, lng } = lngLat.wrap();
      pick.current.onPick(toDeclaredPrecision({ latitude: lat, longitude: lng }));
    });
    map.current = instance;

    return () => {
      loaded.current = false;
      map.current = null;
      instance.remove();
    };
  }, []);

  useEffect(() => {
    pick.current = { picking, onPick };
    const canvas = map.current?.getCanvasContainer();
    if (canvas) canvas.style.cursor = picking ? "crosshair" : "";
  }, [picking, onPick]);

  // Keyed on the content, not the object identity: the page rebuilds these objects on every render,
  // and refitting the view on a render that changed nothing would fight the user panning around.
  const key = JSON.stringify(data);
  useEffect(() => {
    latest.current = data;
    if (map.current === null || !loaded.current) return;
    drawn.current = draw(map.current, data);
    if (fitView) fit(map.current, data);
    // `key` is `data`, serialised. `fitView` only says how to react to a change of data, so it is
    // read here but is not itself a reason to redraw or refit.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Switching the zones on brings them into view, the whole of Ukraine, as long as the view is
  // allowed to move at all.
  const areas = data.layers.ucs2000Areas;
  useEffect(() => {
    if (!areas || !fitView || map.current === null || !loaded.current) return;
    map.current.fitBounds(zoneBounds(UCS2000_ZONE_AREAS), { padding: 40, duration: 600 });
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only the switching on matters.
  }, [areas]);

  const strips = data.layers.ucs2000Strips;
  useEffect(() => {
    if (!strips || !fitView || map.current === null || !loaded.current) return;
    map.current.fitBounds(STRIPS_VIEW, { padding: 40, duration: 600 });
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only the switching on matters.
  }, [strips]);

  // Turning fitting back on brings the view onto what is already drawn, without waiting for the
  // data to change. It runs after the effect above, so it sees data that changed in the same render.
  useEffect(() => {
    if (fitView && map.current !== null && loaded.current) fit(map.current, latest.current);
  }, [fitView]);

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" />
      {picking && (
        <p className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-white/95 px-3 py-1 text-xs text-ink shadow-sm backdrop-blur">
          Клікніть на карті, щоб вибрати точку · Esc — скасувати
        </p>
      )}
      <Legend layers={data.layers} onLayersChange={onLayersChange} />
    </div>
  );
};
