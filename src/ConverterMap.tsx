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

const points = (items: { at: Coordinates; label?: string }[]) =>
  collection(
    items.map(({ at, label }) => ({
      type: "Feature" as const,
      properties: { label: label ?? "" },
      geometry: { type: "Point" as const, coordinates: lngLat(at) },
    })),
  );

const SOURCES = ["input-area", "output-squares", "output-labels", "centre"];

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
  map.addLayer({
    id: "centre",
    type: "circle",
    source: "centre",
    paint: {
      "circle-radius": 6,
      "circle-color": INPUT_COLOUR,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
};

const setData = (map: Map, id: string, data: FeatureCollection) =>
  (map.getSource(id) as GeoJSONSource).setData(data);

const show = (map: Map, { centre, inputArea, outputSquares }: MapData) => {
  setData(map, "centre", points(centre === null ? [] : [{ at: centre }]));
  setData(map, "input-area", polygons(inputArea ? [{ area: inputArea }] : []));
  setData(map, "output-squares", polygons(outputSquares));
  setData(
    map,
    "output-labels",
    points(
      outputSquares.flatMap(({ area, label }) =>
        label === undefined || area.outline === null ? [] : [{ at: area.centre, label }],
      ),
    ),
  );

  if (centre === null) return;

  const bounds = new LngLatBounds(lngLat(centre), lngLat(centre));
  // The outline, not just the corners: a curved edge bulges past the line between them.
  for (const { outline } of [
    ...(inputArea ? [inputArea] : []),
    ...outputSquares.map(({ area }) => area),
  ]) {
    for (const vertex of outline ?? []) bounds.extend(lngLat(vertex));
  }

  // A bare point, or a metre square, would zoom in past anything useful; 17 still shows streets.
  map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 600 });
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
      <Swatch colour={OUTPUT_COLOUR} dashed /> інші квадрати, куди сягає вхідна зона
    </li>
  </ul>
);

export const ConverterMap = (data: MapData) => {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const loaded = useRef(false);
  // What the map should show once its style has loaded; the load handler reads it from here.
  const latest = useRef(data);

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
      show(instance, latest.current);
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
    if (map.current !== null && loaded.current) show(map.current, data);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `key` is `data`, serialised.
  }, [key]);

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" />
      <Legend />
    </div>
  );
};
