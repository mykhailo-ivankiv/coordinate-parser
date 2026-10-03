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

const INPUT_COLOUR = "#2563eb";
const OUTPUT_COLOUR = "#ea580c";

type MapData = {
  /** The stored point: the centre of whatever the input designates. */
  centre: Coordinates | null;
  /** The square the input names, when it is a grid reference. */
  inputArea: Area | null;
  /** The squares the converted values name. */
  outputAreas: Area[];
};

// Taken from maplibre's own signature, so the project needs no separate GeoJSON type package.
type FeatureCollection = Exclude<Parameters<GeoJSONSource["setData"]>[0], string>;

const lngLat = ({ latitude, longitude }: Coordinates): [number, number] => [longitude, latitude];

// The ring follows the grid, not lines of latitude and longitude: a square far from its central
// meridian is drawn slightly rotated, and the edges of a large one as the curves they are.
const squares = (areas: Area[]): FeatureCollection => ({
  type: "FeatureCollection",
  features: areas.flatMap(({ outline }) =>
    outline === null
      ? []
      : [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [outline.map(lngLat)] },
          },
        ],
  ),
});

const point = (centre: Coordinates | null): FeatureCollection => ({
  type: "FeatureCollection",
  features:
    centre === null
      ? []
      : [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: lngLat(centre) },
          },
        ],
});

const addLayers = (map: Map) => {
  for (const id of ["input-area", "output-areas", "centre"]) {
    map.addSource(id, { type: "geojson", data: point(null) });
  }

  map.addLayer({
    id: "output-areas-fill",
    type: "fill",
    source: "output-areas",
    paint: { "fill-color": OUTPUT_COLOUR, "fill-opacity": 0.12 },
  });
  map.addLayer({
    id: "output-areas-line",
    type: "line",
    source: "output-areas",
    paint: { "line-color": OUTPUT_COLOUR, "line-width": 2 },
  });
  map.addLayer({
    id: "input-area-line",
    type: "line",
    source: "input-area",
    paint: { "line-color": INPUT_COLOUR, "line-width": 2, "line-dasharray": [2, 1] },
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

const show = (map: Map, { centre, inputArea, outputAreas }: MapData) => {
  (map.getSource("centre") as GeoJSONSource).setData(point(centre));
  (map.getSource("input-area") as GeoJSONSource).setData(squares(inputArea ? [inputArea] : []));
  (map.getSource("output-areas") as GeoJSONSource).setData(squares(outputAreas));

  if (centre === null) return;

  const bounds = new LngLatBounds(lngLat(centre), lngLat(centre));
  // The outline, not just the corners: a curved edge bulges past the line between them.
  for (const { outline } of [...(inputArea ? [inputArea] : []), ...outputAreas]) {
    for (const vertex of outline ?? []) bounds.extend(lngLat(vertex));
  }

  // A bare point, or a metre square, would zoom in past anything useful; 17 still shows streets.
  map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 600 });
};

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

  return <div ref={container} className="h-full w-full" />;
};
