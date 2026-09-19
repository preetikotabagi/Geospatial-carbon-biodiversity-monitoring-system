import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";

import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const DEFAULT_CENTER = [75.124, 15.3647];
const DEFAULT_ZOOM = 10;

function sitesToGeoJSON(sites) {
  return {
    type: "FeatureCollection",
    features: sites.map((site) => ({
      type: "Feature",
      properties: { id: site.id, name: site.name },
      geometry: site.geometry,
    })),
  };
}

/**
 * Pure(ish) map display component.
 *
 * It owns the Mapbox GL + Draw instance lifecycle, but all "what to show"
 * state (which sites are visible) is driven entirely by the `sites` prop.
 * This is what keeps the map, the summary cards, and the project filter in
 * sync: there is exactly one source of truth (the parent's filtered sites
 * list) and the map just renders it.
 *
 * Exposes `clearDrawing()` via ref so the parent can wipe the in-progress
 * Mapbox Draw polygon after a site has been saved, instead of leaving a
 * stale shape sitting on the map.
 */
const MapView = forwardRef(function MapView(
  { sites, selectedSiteId, onSiteClick, onGeometryCreate, onGeometryDelete },
  ref
) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const mapLoadedRef = useRef(null);
  const sitesRef = useRef(sites);

  useImperativeHandle(ref, () => ({
    clearDrawing() {
      drawRef.current?.deleteAll();
    },
  }));

  // Keep an always-current ref so the click handler (registered once) can
  // read the latest sites without needing to be re-registered.
  useEffect(() => {
    sitesRef.current = sites;
  }, [sites]);

  // Initialize the map exactly once.
  useEffect(() => {
    if (mapRef.current) return;

    if (!mapboxgl.accessToken) {
      console.error(
        "VITE_MAPBOX_TOKEN is not set. Add it to frontend/.env (see .env.example)."
      );
    }

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      scrollZoom: false,
    });

    mapRef.current = map;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: true,
        trash: true,
      },
    });

    drawRef.current = draw;
    map.addControl(draw, "top-left");
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    const handleDrawCreate = (event) => {
      onGeometryCreate?.(event.features[0].geometry);
    };
    const handleDrawDelete = () => {
      onGeometryDelete?.();
    };
    const handleDrawUpdate = (event) => {
      onGeometryCreate?.(event.features[0].geometry);
    };

    map.on("draw.create", handleDrawCreate);
    map.on("draw.delete", handleDrawDelete);
    map.on("draw.update", handleDrawUpdate);

    const handleClick = (e) => {
      const layers = ["sites-selected-fill", "sites-fill"].filter((id) => map.getLayer(id));
      if (!layers.length) return;

      const features = map.queryRenderedFeatures(e.point, { layers });
      if (!features.length) return;

      const siteId = features[0].properties.id;
      onSiteClick?.(siteId);
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("load", () => {
      map.addSource("sites", {
        type: "geojson",
        data: sitesToGeoJSON(sitesRef.current),
      });

      map.addLayer({
        id: "sites-fill",
        type: "fill",
        source: "sites",
        paint: {
          "fill-color": "#1f7a4c",
          "fill-opacity": 0.32,
        },
      });

      map.addLayer({
        id: "sites-outline",
        type: "line",
        source: "sites",
        paint: {
          "line-color": "#16603a",
          "line-width": 2,
        },
      });

      // Rendered on top of the base layers and filtered down to just the
      // currently-selected site, so there is one obvious highlighted shape.
      map.addLayer({
        id: "sites-selected-fill",
        type: "fill",
        source: "sites",
        filter: ["==", ["get", "id"], -1],
        paint: {
          "fill-color": "#e8a33d",
          "fill-opacity": 0.45,
        },
      });

      map.addLayer({
        id: "sites-selected-outline",
        type: "line",
        source: "sites",
        filter: ["==", ["get", "id"], -1],
        paint: {
          "line-color": "#b9791c",
          "line-width": 3,
        },
      });

      map.on("click", "sites-fill", handleClick);
      map.on("click", "sites-selected-fill", handleClick);
      map.on("mouseenter", "sites-fill", handleMouseEnter);
      map.on("mouseleave", "sites-fill", handleMouseLeave);
      map.on("mouseenter", "sites-selected-fill", handleMouseEnter);
      map.on("mouseleave", "sites-selected-fill", handleMouseLeave);

      mapLoadedRef.current = true;

      // Fit to whatever sites we already have as soon as the map is ready.
      fitToSites(map, sitesRef.current);
    });

    return () => {
      map.off("draw.create", handleDrawCreate);
      map.off("draw.delete", handleDrawDelete);
      map.off("draw.update", handleDrawUpdate);
      map.off("click", "sites-fill", handleClick);
      map.off("click", "sites-selected-fill", handleClick);
      map.off("mouseenter", "sites-fill", handleMouseEnter);
      map.off("mouseleave", "sites-fill", handleMouseLeave);
      map.off("mouseenter", "sites-selected-fill", handleMouseEnter);
      map.off("mouseleave", "sites-selected-fill", handleMouseLeave);
      map.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever the (already filtered) sites list changes, update the map
  // source and refit the viewport. This is the single place that keeps the
  // map polygons in sync with the project filter -- no separate "load"
  // vs. "filter" code paths to fall out of sync with each other.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const source = map.getSource("sites");
    if (!source) return;

    source.setData(sitesToGeoJSON(sites));
    fitToSites(map, sites);
  }, [sites]);

  // Keep the "selected site" highlight layers in sync with whichever site
  // is currently open in the analytics panel.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    if (!map.getLayer("sites-selected-fill")) return;

    const filterValue = selectedSiteId ?? -1;
    map.setFilter("sites-selected-fill", ["==", ["get", "id"], filterValue]);
    map.setFilter("sites-selected-outline", ["==", ["get", "id"], filterValue]);
  }, [selectedSiteId, sites]);

  return <div ref={mapContainerRef} className="map-container" />;
});

function fitToSites(map, sites) {
  if (!sites.length) return;

  const bounds = new mapboxgl.LngLatBounds();
  let hasCoordinates = false;

  sites.forEach((site) => {
    const rings = site.geometry?.coordinates || [];
    rings.forEach((ring) => {
      ring.forEach((coordinate) => {
        bounds.extend(coordinate);
        hasCoordinates = true;
      });
    });
  });

  if (hasCoordinates && !bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 500 });
  }
}

export default MapView;
