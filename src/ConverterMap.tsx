import {
  type GeoJSONSource,
  LngLatBounds,
  Map,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef } from "react";
import type { Area } from "./converters/coordinateConverter.ts";
import type { Coordinates } from "./parsers/commonParsers.ts";

// OpenFreeMap: free vector tiles from OpenStreetMap data, no API key and no registration.
// https://openfreemap.org
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// MapLibre looks for its worker next to its own module, which is not where Vite serves it from once
// the library is pre-bundled or hashed into the build. Vite builds the worker itself and says where.
setWorkerUrl(workerUrl);

const KYIV: [number, number] = [30.5234, 50.4501];

// Green is what was typed in, red is what it converts to. Both fills are translucent, so where an
// input zone and a converted square overlap the two tints mix, and the overlap reads at a glance.
const INPUT_COLOUR = "#16a34a";
const OUTPUT_COLOUR = "#dc2626";

export type OutputSquare = {
  area: Area;
  /** The reference written on the square, when there are several to tell apart. */
  label?: string;
  /** The square holding the input's centre: the one the conversion actually returns. */
  primary: boolean;
};

type MapData = {
  /** The stored point: the centre of whatever the input designates. */
  centre: Coordinates | null;
  /** The zone the input names, when it is a grid reference. */
  inputArea: Area | null;
  /** The squares the input converts to; several when the input zone reaches more than one. */
  outputSquares: OutputSquare[];
  /** Converted values that are points rather than squares: the WGS 84 latitude and longitude. */
  outputPoints: Coordinates[];
};

// Taken from maplibre's own signature, so the project needs no separate GeoJSON type package.
type FeatureCollection = Exclude<Parameters<GeoJSONSource["setData"]>[0], string>;

const lngLat = ({ latitude, longitude }: Coordinates): [number, number] => [longitude, latitude];

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

const points = (items: { at: Coordinates; label?: string; primary?: boolean }[]) =>
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

const SOURCES = ["input-area", "output-squares", "output-labels", "output-points", "centre"];

const addLayers = (map: Map) => {
  for (const id of SOURCES) map.addSource(id, { type: "geojson", data: collection([]) });

  map.addLayer({
    id: "input-area-fill",
    type: "fill",
    source: "input-area",
    paint: { "fill-color": INPUT_COLOUR, "fill-opacity": 0.15 },
  });
  map.addLayer({
    id: "output-squares-fill",
    type: "fill",
    source: "output-squares",
    paint: { "fill-color": OUTPUT_COLOUR, "fill-opacity": 0.1 },
  });
  // The square the conversion returns is drawn solid; the others the input zone also reaches,
  // dashed: the point could be in any of them, but the stored centre is in the solid one.
  map.addLayer({
    id: "output-squares-other",
    type: "line",
    source: "output-squares",
    filter: ["==", ["get", "primary"], false],
    paint: { "line-color": OUTPUT_COLOUR, "line-width": 1.5, "line-dasharray": [3, 2] },
  });
  map.addLayer({
    id: "output-squares-primary",
    type: "line",
    source: "output-squares",
    filter: ["==", ["get", "primary"], true],
    paint: { "line-color": OUTPUT_COLOUR, "line-width": 2.5 },
  });
  map.addLayer({
    id: "input-area-line",
    type: "line",
    source: "input-area",
    paint: { "line-color": INPUT_COLOUR, "line-width": 2.5 },
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
    paint: { "text-color": OUTPUT_COLOUR, "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
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
      "circle-stroke-width": 2.5,
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
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });
};

const setData = (map: Map, id: string, data: FeatureCollection) =>
  (map.getSource(id) as GeoJSONSource).setData(data);

/**
 * Fills the sources for the current zoom: squares big enough to see as polygons, the rest as rings.
 * Returns which squares came out as rings, so a zoom that changes nothing can skip the redraw.
 */
const draw = (map: Map, { centre, inputArea, outputSquares, outputPoints }: MapData) => {
  const zoom = map.getZoom();
  const visible = outputSquares.filter(({ area }) => !tooSmall(area, zoom));
  const rings = outputSquares.filter(({ area }) => tooSmall(area, zoom));

  setData(map, "centre", points(centre === null ? [] : [{ at: centre }]));
  setData(map, "input-area", polygons(inputArea ? [{ area: inputArea }] : []));
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

const Swatch = ({ colour, dashed = false }: { colour: string; dashed?: boolean }) => (
  <span
    className="inline-block h-3 w-5 align-middle"
    style={{
      backgroundColor: `${colour}26`,
      border: `2px ${dashed ? "dashed" : "solid"} ${colour}`,
    }}
  />
);

const Legend = () => (
  <ul className="absolute bottom-8 left-2 flex flex-col gap-1 rounded-sm bg-white/90 p-2 text-xs text-black shadow">
    <li>
      <Swatch colour={INPUT_COLOUR} /> введене значення
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
      <Swatch colour={OUTPUT_COLOUR} dashed /> інші квадрати, куди сягає вхідна зона
    </li>
  </ul>
);

export const ConverterMap = (data: MapData) => {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const loaded = useRef(false);
  // What the map should show once its style has loaded; the load and zoom handlers read it here.
  const latest = useRef(data);
  // Which squares are currently drawn as rings, to tell whether a zoom needs a redraw.
  const drawn = useRef("");

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
    map.current = instance;

    return () => {
      loaded.current = false;
      map.current = null;
      instance.remove();
    };
  }, []);

  // Keyed on the content, not the object identity: the page rebuilds these objects on every render,
  // and refitting the view on a render that changed nothing would fight the user panning around.
  const key = JSON.stringify(data);
  useEffect(() => {
    latest.current = data;
    if (map.current === null || !loaded.current) return;
    drawn.current = draw(map.current, data);
    fit(map.current, data);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `key` is `data`, serialised.
  }, [key]);

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" />
      <Legend />
    </div>
  );
};
