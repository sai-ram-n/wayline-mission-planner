/**
 * Leaflet map canvas for the mission editor.
 *
 * Click the map to append a waypoint, drag a marker to reposition it, click a
 * marker to select it. The route is drawn as a casing + line so it stays legible
 * over both street and terrain tiles.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  Rectangle,
  ScaleControl,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import {
  LuBox,
  LuCheck,
  LuCircle,
  LuCrosshair,
  LuLayers,
  LuLoaderCircle,
  LuMapPinPlus,
  LuMaximize,
  LuMapPin,
  LuPencil,
  LuPlaneTakeoff,
  LuRuler,
  LuSearch,
  LuShieldAlert,
  LuSquare,
  LuTrash2,
  LuUndo2,
  LuX,
} from 'react-icons/lu';
import {
  COVERAGE_OPACITY,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAP_COLORS,
  TILE_LAYERS,
} from '../../lib/constants.js';
import {
  bearingBetween,
  coverageWedge,
  headingAt,
  heightAt,
  metresBetween,
  offsetLatLng,
  waypointBounds,
} from '../../lib/geo.js';
import { groundClearance, rangeFor, wideHFov, zoomHFov, zoomRatioAt } from '../../lib/camera.js';
import { buildSearchUrl, parseSearchResults } from '../../lib/geocode.js';
import { VIRTUAL_FLIGHT_KEYS, stepVirtualFlight } from '../../lib/virtualFlight.js';
import api from '../../api.js';
import Map3DOverlay from './Map3DOverlay.jsx';
import {
  DEFAULT_EXAGGERATION,
  DEFAULT_PERSPECTIVE,
  DEFAULT_PITCH,
  MAX_EXAGGERATION,
  MAX_PITCH,
  MIN_EXAGGERATION,
  autoExaggeration,
  metresPerPixel,
  perspectiveFor,
  clampPitch,
  cssTransform,
  panFactor,
} from '../../lib/projection3d.js';

/*
  The gimbal orientation fan. The reference draws a small 3D model at the
  waypoint (waypoint-camera-visuals §4); this is the flat equivalent, deliberately
  much shorter than a coverage wedge so it reads as a heading indicator.

  Its length is in *screen pixels*, not metres. FlightHub's marker keeps a usable
  size as you zoom out; a fixed ground length collapses to two or three pixels at
  route-overview zoom — which is the view you land on after opening a route — and
  the heading becomes unreadable exactly when it is most wanted.
*/
const GIMBAL_MARKER_FOV = 55;
const GIMBAL_MARKER_PX = 22;

/**
 * A numbered waypoint pin. Built as a divIcon so the index is real text —
 * readable, selectable and styleable without generating images.
 */
function waypointIcon(index, { selected, isStart, isEnd, editing }) {
  const fill = editing || selected
    ? MAP_COLORS.markerSelected
    : isStart
      ? MAP_COLORS.start
      : MAP_COLORS.marker;
  const ring = selected ? '#fff' : 'rgba(255,255,255,.55)';
  const label = isStart ? 'S' : String(index + 1);

  return L.divIcon({
    className: 'wmp-waypoint-icon',
    html: `
      <div style="
        width:26px;height:26px;border-radius:50%;
        background:${fill};border:2px solid ${ring};
        box-shadow:0 1px 4px rgba(0,0,0,.6);
        display:flex;align-items:center;justify-content:center;
        font:600 11px/1 Inter,system-ui,sans-serif;
        color:#06101c;">${label}</div>
      ${isEnd ? '<div style="position:absolute;inset:-4px;border:1px dashed rgba(255,255,255,.5);border-radius:50%"></div>' : ''}
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/**
 * How far the map plane extends past the viewport in 3D. Tilting a viewport-sized
 * plane leaves it visibly ending in mid-air, so it is drawn larger and centred.
 * The overlay uses the same value to stay aligned with the tiles.
 */
const PLANE_INSET = '-45% -25%';

/** The reference takeoff point marker. */
const takeoffIcon = L.divIcon({
  className: 'wmp-takeoff-icon',
  html: `
    <div style="
      width:22px;height:22px;border-radius:4px;
      background:${MAP_COLORS.takeoff};border:2px solid rgba(255,255,255,.7);
      box-shadow:0 1px 4px rgba(0,0,0,.6);
      display:flex;align-items:center;justify-content:center;
      font:700 10px/1 Inter,system-ui,sans-serif;color:#2b1c00;">H</div>
  `,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/**
 * Translates map clicks into waypoints or drawing vertices.
 *
 * While drawing, double-click finishes the shape (§8), so the default
 * double-click-to-zoom is suppressed for the duration.
 */
function ClickHandler({ onMapClick, onMapDoubleClick, drawing }) {
  const map = useMap();

  useEffect(() => {
    if (drawing) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
    return () => map.doubleClickZoom.enable();
  }, [drawing, map]);

  useMapEvents({
    click(event) {
      onMapClick(event.latlng);
    },
    dblclick(event) {
      if (!drawing) return;
      L.DomEvent.stopPropagation(event);
      onMapDoubleClick?.(event.latlng);
    },
  });
  return null;
}

/** Fits the map to the route once, when a saved mission is first loaded. */
function FitOnLoad({ waypoints, trigger }) {
  const map = useMap();
  useEffect(() => {
    const bounds = waypointBounds(waypoints);
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [64, 64], maxZoom: 18 });
    // `trigger` changes when a different mission is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  return null;
}

/**
 * Pencil and trash pinned just above the selected waypoint's marker (§7).
 *
 * Rendered outside the Leaflet panes so they inherit app styling, and
 * repositioned on every map move so they stay attached to the marker.
 */
function WaypointBadgeControls({ map, waypoint, editing, onEdit, onRemove }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!map) return undefined;
    const redraw = () => setTick((n) => n + 1);
    const events = ['move', 'zoom', 'resize'];
    events.forEach((event) => map.on(event, redraw));
    return () => events.forEach((event) => map.off(event, redraw));
  }, [map]);

  if (!map) return null;
  const point = map.latLngToContainerPoint([waypoint.lat, waypoint.lng]);

  return (
    <div
      className="absolute z-[460] flex -translate-x-1/2 items-center gap-0.5 rounded-sm border border-panel-600 bg-panel-900/95 px-1 py-0.5 shadow-lg"
      style={{ left: point.x, top: point.y - 34 }}
    >
      <button
        type="button"
        onClick={onEdit}
        title="Change waypoint location"
        className={`rounded-sm p-1 transition-colors ${
          editing ? 'bg-[#ff9500] text-black' : 'text-slate-300 hover:bg-panel-700'
        }`}
      >
        <LuPencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        title="Delete waypoint"
        className="rounded-sm p-1 text-slate-300 transition-colors hover:bg-red-950 hover:text-red-400"
      >
        <LuTrash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

/**
 * Per-waypoint gimbal orientation fans, held at a constant on-screen size.
 *
 * Redraws on zoom because the metre length backing those pixels changes with it.
 */
function GimbalOrientationLayer({ waypoints, settings }) {
  const map = useMap();
  const [, setTick] = useState(0);

  useEffect(() => {
    const redraw = () => setTick((n) => n + 1);
    map.on('zoomend', redraw);
    return () => map.off('zoomend', redraw);
  }, [map]);

  const zoom = map.getZoom();

  return waypoints.map((waypoint, index) => {
    const metres = GIMBAL_MARKER_PX * metresPerPixel(waypoint.lat, zoom);
    return (
      <Polygon
        key={`gimbal-${waypoint.id ?? index}`}
        positions={coverageWedge(
          waypoint.lat,
          waypoint.lng,
          headingAt(waypoints, index, settings),
          GIMBAL_MARKER_FOV,
          metres,
          12
        )}
        pathOptions={{
          color: MAP_COLORS.gimbalMarker,
          weight: 1.5,
          opacity: 0.95,
          fillColor: MAP_COLORS.gimbalMarker,
          fillOpacity: 0.55,
          interactive: false,
        }}
      />
    );
  });
}

/** Exposes the Leaflet instance so toolbar buttons can drive the map. */
function MapRefBridge({ onReady }) {
  const map = useMap();
  useEffect(() => onReady(map), [map, onReady]);
  return null;
}

/**
 * Heading readout for the map's control cluster (feature-gap audit §"Compass /
 * heading indicator"). Leaflet has no built-in map-rotation control, so this is
 * a needle-and-degree indicator rather than a rotating basemap — it shows the
 * selected waypoint's heading, not an interactive bearing control.
 */
function CompassWidget({ heading }) {
  const known = heading != null;
  const angle = known ? heading : 0;
  return (
    <div
      title={known ? `Heading ${Math.round(angle)}°` : 'Select a waypoint to see its heading'}
      className="pointer-events-auto flex h-9 w-9 flex-col items-center justify-center rounded-full border border-panel-700 bg-panel-900/95 shadow-lg"
    >
      <div
        aria-hidden
        className="relative h-5 w-5"
        style={{ transform: `rotate(${angle}deg)`, transition: 'transform 200ms ease-out' }}
      >
        <span
          className={`absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[4px] border-b-[9px] border-x-transparent ${
            known ? 'border-b-accent' : 'border-b-slate-600'
          }`}
        />
      </div>
      <span className={`text-[8px] font-medium ${known ? 'text-slate-300' : 'text-slate-600'}`}>
        {known ? `${Math.round(angle)}°` : 'N'}
      </span>
    </div>
  );
}

/**
 * Place-name search (feature-gap audit §"Map search tool"). A free-standing
 * box, not part of Leaflet's own control system, so it can own its own
 * dropdown of results. `onSelect` receives the chosen `{ lat, lng }`.
 */
function MapSearchBox({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);

  const runSearch = async (event) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(buildSearchUrl(trimmed));
      if (!response.ok) throw new Error('Search failed');
      const parsed = parseSearchResults(await response.json());
      setResults(parsed);
      setOpen(true);
      if (!parsed.length) setError('No matches found.');
    } catch {
      setResults([]);
      setError('Search failed. Check your connection and try again.');
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pointer-events-auto relative w-64">
      <form onSubmit={runSearch} className="flex items-center gap-1 rounded-md border border-panel-700 bg-panel-900/95 px-2 py-1 shadow-lg">
        <LuSearch className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search for a place"
          aria-label="Search for a place on the map"
          className="min-w-0 flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none"
        />
        {loading && <LuLoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-500" />}
        {!loading && query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              setResults([]);
              setOpen(false);
            }}
            className="shrink-0 text-slate-500 hover:text-slate-300"
          >
            <LuX className="h-3.5 w-3.5" />
          </button>
        )}
      </form>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-panel-600 bg-panel-800 py-1 shadow-2xl">
            {error && <p className="px-2.5 py-1.5 text-[11px] text-slate-500">{error}</p>}
            {results.map((result, index) => (
              <button
                key={`${result.lat}-${result.lng}-${index}`}
                type="button"
                onClick={() => {
                  onSelect(result);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-slate-300 hover:bg-panel-700"
              >
                <LuMapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1 truncate">{result.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function MapCanvas({
  waypoints = [],
  takeoffPoint = null,
  selectedIndex = null,
  placementMode = null,
  onAddWaypoint,
  onMoveWaypoint,
  onSelectWaypoint,
  onPlacePoint,
  fitTrigger,
  children,
  // --- mapping routes (Phase 5)
  drawMode = null, // 'area' | 'linear' | null
  draft = [], // vertices captured so far while drawing
  geometry = null, // the committed shape, as { vertices }
  generatedLines = [], // boustrophedon lines to preview
  onDrawVertex,
  onFinishDrawing,
  onCancelDrawing,
  onMoveGeometryVertex,
  // Preview mode: no editing, used by the library's map panel.
  readOnly = false,
  // Flight route display settings (§3). All default off.
  display = {},
  // Route settings, used by the tilted view to resolve waypoint altitudes.
  settings = {},
  // Aircraft model id, so coverage wedges can use its measured field of view.
  aircraftModel = null,
  // Index being repositioned, plus its confirm/cancel handlers (§7).
  editingIndex = null,
  onEditWaypoint,
  onConfirmEdit,
  onCancelEdit,
  onRemoveWaypoint,
}) {
  const [basemap, setBasemap] = useState('street');
  const mapRef = useRef(null);

  /* -------------------------------------------------------- annotations */
  /*
    Free-standing map markup (feature-gap audit §"Map annotation, measurement,
    and rectangle/circle draw tools") — deliberately independent of any one
    wayline's route geometry (`geometry`/`drawMode` above are mission data
    driven by the parent page; these are project-wide map chrome instead, the
    same way DJI FlightHub's annotation layer sits under every route). Fetched
    directly here rather than threaded through both Editor.jsx and Library.jsx
    as props, since both already mount this component and neither otherwise
    owns anything about the map's own chrome layers (basemap choice, 2D/3D,
    etc. are also local state here).
  */
  const [annotations, setAnnotations] = useState([]);
  const [annotateMode, setAnnotateMode] = useState(null); // 'point'|'line'|'rectangle'|'circle'|null
  const [annotateDraft, setAnnotateDraft] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api.annotations
      .list()
      .then((list) => {
        if (!cancelled) setAnnotations(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // A parent-driven mapping-route drawMode takes priority; don't leave an
  // annotate tool armed underneath it.
  useEffect(() => {
    if (drawMode) {
      setAnnotateMode(null);
      setAnnotateDraft([]);
    }
  }, [drawMode]);

  const submitAnnotation = (kind, geometry) => {
    api.annotations
      .create({ kind, geometry })
      .then((created) => setAnnotations((current) => [...current, created]))
      .catch(() => {});
  };

  const handleAnnotateClick = (latlng) => {
    if (annotateMode === 'point') {
      submitAnnotation('point', { lat: latlng.lat, lng: latlng.lng });
      return;
    }
    if (annotateMode === 'line' || annotateMode === 'zone') {
      setAnnotateDraft((current) => [...current, latlng]);
      return;
    }
    if (annotateMode === 'rectangle') {
      const next = [...annotateDraft, latlng];
      if (next.length < 2) {
        setAnnotateDraft(next);
        return;
      }
      submitAnnotation(
        'rectangle',
        next.map((p) => ({ lat: p.lat, lng: p.lng }))
      );
      setAnnotateDraft([]);
      return;
    }
    if (annotateMode === 'circle') {
      const next = [...annotateDraft, latlng];
      if (next.length < 2) {
        setAnnotateDraft(next);
        return;
      }
      const [center, edge] = next;
      submitAnnotation('circle', {
        center: { lat: center.lat, lng: center.lng },
        radiusMeters: Math.max(1, metresBetween(center, edge)),
      });
      setAnnotateDraft([]);
    }
  };

  const finishAnnotationLine = () => {
    if (annotateMode === 'zone') {
      if (annotateDraft.length >= 3) {
        // eslint-disable-next-line no-alert
        const name = window.prompt('Name this GEO Zone (Cancel to discard):');
        if (name?.trim()) {
          submitGeoZone(
            name.trim(),
            annotateDraft.map((p) => ({ lat: p.lat, lng: p.lng }))
          );
        }
      }
      setAnnotateDraft([]);
      return;
    }
    if (annotateDraft.length >= 2) {
      submitAnnotation(
        'line',
        annotateDraft.map((p) => ({ lat: p.lat, lng: p.lng }))
      );
    }
    setAnnotateDraft([]);
  };

  const deleteAnnotation = (id) => {
    api.annotations
      .remove(id)
      .then(() => setAnnotations((current) => current.filter((a) => a.id !== id)))
      .catch(() => {});
  };

  /*
    GEO Zone / Task Area overlays (feature-gap audit §"GEO Zone / Task Area map
    overlays"). DJI's own zones are org-provisioned data with no equivalent
    source in this single-tenant app, so these are user-authored placeholder
    polygons — see repository.js's createGeoZone. Scoped down to a single
    author-able kind ('geo_zone'); 'task_area' is still rendered correctly if
    present in the data, just not offered as a creation option in this pass.
  */
  const [geoZones, setGeoZones] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api.geoZones
      .list()
      .then((list) => {
        if (!cancelled) setGeoZones(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const submitGeoZone = (name, vertices) => {
    api.geoZones
      .create({ name, kind: 'geo_zone', vertices })
      .then((created) => setGeoZones((current) => [...current, created]))
      .catch(() => {});
  };

  const deleteGeoZone = (id) => {
    api.geoZones
      .remove(id)
      .then(() => setGeoZones((current) => current.filter((z) => z.id !== id)))
      .catch(() => {});
  };

  /* --------------------------------------------------------- tilted view */

  // View state only: never written to the mission, so switching cannot dirty it.
  const [is3D, setIs3D] = useState(false);
  const [pitch, setPitch] = useState(0);
  const [exaggeration, setExaggeration] = useState(DEFAULT_EXAGGERATION);
  // Auto until the user moves the slider, because the useful factor depends on
  // zoom and altitude — see autoExaggeration in lib/projection3d.js.
  const [autoScale, setAutoScale] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [planeHeight, setPlaneHeight] = useState(0);
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const dragState = useRef(null);

  /** Highest waypoint on the route, used to fit the vertical scale. */
  const maxAltitude = useMemo(
    () =>
      waypoints.reduce(
        (highest, w) =>
          Math.max(
            highest,
            w.use_global_height === false && w.height != null
              ? w.height
              : (w.height ?? settings.globalHeight ?? 100)
          ),
        0
      ),
    [waypoints, settings.globalHeight]
  );

  const effectiveExaggeration = useMemo(() => {
    if (!autoScale) return exaggeration;
    const map = mapRef.current;
    if (!map) return DEFAULT_EXAGGERATION;
    // Measured against the visible viewport, not the oversized plane: the plane
    // extends well past the top of the screen, so fitting to it would still let
    // tall waypoints climb out of view.
    const visibleHeight = containerRef.current?.clientHeight ?? map.getSize().y;
    return autoExaggeration(maxAltitude, map.getCenter().lat, map.getZoom(), visibleHeight);
    // Recomputed on pitch changes too, which is when the view is being adjusted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScale, exaggeration, maxAltitude, mapReady, is3D, pitch]);

  const enter3D = () => {
    setIs3D(true);
    setPitch(DEFAULT_PITCH);
    // Leaflet must re-measure: the container grows in 3D so the tilted plane
    // still covers the frame instead of ending in mid-air.
    setTimeout(() => {
      mapRef.current?.invalidateSize({ animate: false });
      setPlaneHeight(wrapperRef.current?.getBoundingClientRect().height ?? 0);
    }, 60);
  };
  const exit3D = () => {
    setIs3D(false);
    setPitch(0);
    setVirtualFlight(null);
    setTimeout(() => mapRef.current?.invalidateSize({ animate: false }), 60);
  };

  /* --------------------------------------------------- virtual flight (FPV) */
  /*
    Feature-gap audit §"Virtual-flight / FPV authoring". DJI's own mode needs
    a real 3D terrain/scene service this build has no dependency on (project
    decision, not made) — see docs/DJI_MATRICE_4D_FINAL_GAP_ANALYSIS.md. This
    is the scoped-down version: fly a virtual aircraft with discrete WASD/QE/
    CZ steps (lib/virtualFlight.js) over the existing flat-ground tilted view,
    and drop a waypoint at its position/heading with Space — same fields the
    click-to-place path already writes, just sourced from the flight state
    instead of a map click.
  */
  const [virtualFlight, setVirtualFlight] = useState(null);

  const startVirtualFlight = () => {
    if (readOnly) return;
    setAnnotateMode(null);
    setAnnotateDraft([]);
    if (!is3D) enter3D();

    const lastIndex = waypoints.length - 1;
    const last = waypoints[lastIndex];
    let seed;
    if (last) {
      seed = {
        lat: last.lat,
        lng: last.lng,
        height: heightAt(last, settings),
        heading: headingAt(waypoints, lastIndex, settings),
      };
    } else {
      const center = mapRef.current?.getCenter();
      seed = {
        lat: center?.lat ?? DEFAULT_CENTER[0],
        lng: center?.lng ?? DEFAULT_CENTER[1],
        height: settings.globalHeight ?? 100,
        heading: 0,
      };
    }
    setVirtualFlight(seed);
  };

  const stopVirtualFlight = () => setVirtualFlight(null);

  useEffect(() => {
    if (!virtualFlight) return undefined;
    const onKey = (event) => {
      if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (VIRTUAL_FLIGHT_KEYS.includes(key)) {
        event.preventDefault();
        setVirtualFlight((current) => (current ? stepVirtualFlight(current, key) : current));
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        onAddWaypoint?.({
          lat: virtualFlight.lat,
          lng: virtualFlight.lng,
          // Captured live, not inherited from the route — same as the
          // reference: virtual-flight waypoints record the exact altitude and
          // heading the aircraft had, not the route defaults.
          height: virtualFlight.height,
          use_global_height: false,
          heading_mode: 'manually',
          heading_angle: virtualFlight.heading,
          use_global_heading: false,
        });
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        stopVirtualFlight();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [virtualFlight, onAddWaypoint]);

  /*
   * Leaflet derives lat/lng from the container's bounding rect, which a CSS 3D
   * transform invalidates — its own drag and wheel handlers would scroll the map
   * to the wrong place. They are turned off while tilted and replaced below.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handlers = ['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'boxZoom'];
    handlers.forEach((name) => {
      if (!map[name]) return;
      if (is3D) map[name].disable();
      else map[name].enable();
    });
  }, [is3D, mapReady]);

  /** Ctrl + drag tilts; a plain drag pans; the wheel zooms. */
  const handle3DPointerDown = (event) => {
    if (!is3D || event.button !== 0) return;
    dragState.current = {
      mode: event.ctrlKey || event.metaKey ? 'tilt' : 'pan',
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handle3DPointerMove = (event) => {
    const drag = dragState.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;

    if (drag.mode === 'tilt') {
      // Dragging up tilts further over; a quarter degree per pixel feels right.
      setPitch((current) => clampPitch(current - dy * 0.25));
    } else {
      // Ground moves less per pixel near the horizon, so compensate vertically.
      mapRef.current?.panBy([-dx, -dy * panFactor(pitch)], { animate: false });
    }
  };

  const handle3DPointerUp = (event) => {
    dragState.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handle3DWheel = (event) => {
    if (!is3D) return;
    const map = mapRef.current;
    if (!map) return;
    event.preventDefault();
    map.setZoom(map.getZoom() + (event.deltaY < 0 ? 1 : -1));
  };

  const positions = useMemo(() => waypoints.map((w) => [w.lat, w.lng]), [waypoints]);

  /*
    Null for every aircraft whose field of view was never measured, which
    switches the coverage layer off rather than drawing a made-up footprint.
  */
  const coverageFov = wideHFov(aircraftModel);

  // Feeds the compass widget and the coordinate/altitude readout below.
  const selectedWaypoint =
    selectedIndex != null ? waypoints[selectedIndex] : null;
  const selectedHeading = selectedWaypoint
    ? headingAt(waypoints, selectedIndex, settings)
    : null;

  const handleMapClick = (latlng) => {
    // The tilted view is view-only: Leaflet's screen-to-latlng is unreliable
    // under a CSS 3D transform, so a click would land in the wrong place.
    if (readOnly || is3D) return;
    // A placement mode (e.g. "set takeoff point") consumes the next click.
    if (placementMode) {
      onPlacePoint?.(latlng, placementMode);
      return;
    }
    if (drawMode) {
      onDrawVertex?.(latlng);
      return;
    }
    if (annotateMode) {
      handleAnnotateClick(latlng);
      return;
    }
    onAddWaypoint?.(latlng);
  };

  // Esc cancels an in-progress shape, matching the reference editor (§8).
  useEffect(() => {
    if (!drawMode) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onCancelDrawing?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawMode, onCancelDrawing]);

  // Esc also cancels an in-progress annotation line/rectangle/circle.
  useEffect(() => {
    if (!annotateDraft.length) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setAnnotateDraft([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [annotateDraft.length]);

  const fitRoute = () => {
    const bounds = waypointBounds(waypoints);
    if (bounds && mapRef.current) {
      mapRef.current.fitBounds(bounds, { padding: [64, 64], maxZoom: 18 });
    }
  };

  const tiles = TILE_LAYERS[basemap];

  // A committed area is a closed ring; a linear route is an open centre line.
  const committed = useMemo(() => geometry?.vertices ?? [], [geometry]);
  const isAreaShape = geometry?.kind === 'area';

  const flat = !is3D;
  // One value drives both the CSS on the tiles and the overlay's maths.
  const perspective = perspectiveFor(planeHeight);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {/*
        Past the far edge of the tilted plane there is nothing to draw. A sky
        gradient makes that deliberate rather than looking like the map failed
        to load.
      */}
      {!readOnly && !is3D && selectedIndex != null && waypoints[selectedIndex] && (
        <WaypointBadgeControls
          map={mapRef.current}
          waypoint={waypoints[selectedIndex]}
          editing={editingIndex === selectedIndex}
          onEdit={() => onEditWaypoint?.(selectedIndex)}
          onRemove={() => onRemoveWaypoint?.(selectedIndex)}
        />
      )}

      {editingIndex != null && (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-[470] flex justify-center">
          <div className="pointer-events-auto flex items-center gap-4 rounded-sm bg-[#ff9500]/90 px-6 py-2 text-sm font-medium text-black shadow-xl">
            Editing waypoint
            <button
              type="button"
              onClick={() => onConfirmEdit?.()}
              title="Confirm"
              className="flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs hover:bg-black/15"
            >
              <LuCheck className="h-4 w-4" />
              <span className="font-mono">[Space]</span>
            </button>
            <button
              type="button"
              onClick={() => onCancelEdit?.()}
              title="Cancel"
              className="flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs hover:bg-black/15"
            >
              <LuX className="h-4 w-4" />
              <span className="font-mono">[Esc]</span>
            </button>
          </div>
        </div>
      )}

      {is3D && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              'linear-gradient(to bottom, #0b0f14 0%, #16222f 45%, #24384c 70%, #24384c 100%)',
          }}
        />
      )}
      {/*
        In 3D the map plane is drawn larger than the viewport and centred, so
        that once tilted it still reaches past every edge. Without this the
        plane visibly ends part-way up the screen with panel behind it.
      */}
      <div
        ref={wrapperRef}
        className="absolute"
        style={{
          inset: is3D ? PLANE_INSET : 0,
          transform: cssTransform(pitch, perspective),
          transformOrigin: '50% 50%',
          transition: dragState.current ? 'none' : 'transform 250ms ease-out',
          willChange: is3D ? 'transform' : 'auto',
        }}
      >
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full bg-panel-950"
        zoomControl={false}
        attributionControl
      >
        <TileLayer url={tiles.url} attribution={tiles.attribution} maxZoom={tiles.maxZoom} />
        {/* Persistent scale bar (feature-gap audit §"coordinate/altitude reference display"). */}
        <ScaleControl position="bottomleft" metric imperial={false} />

        <MapRefBridge
          onReady={(m) => {
            mapRef.current = m;
            setMapReady(true);
          }}
        />
        <ClickHandler
          onMapClick={handleMapClick}
          onMapDoubleClick={() => {
            if (annotateMode === 'line' || annotateMode === 'zone') finishAnnotationLine();
            else onFinishDrawing?.();
          }}
          drawing={
            !!drawMode ||
            ((annotateMode === 'line' || annotateMode === 'zone') && annotateDraft.length > 0)
          }
        />
        <FitOnLoad waypoints={waypoints} trigger={fitTrigger} />

        {/* The surveyed area or corridor centre line, once committed. */}
        {flat && committed.length > 1 &&
          (isAreaShape ? (
            <Polygon
              positions={committed}
              pathOptions={{ color: MAP_COLORS.area, weight: 2, fillOpacity: 0.08 }}
            />
          ) : (
            <Polyline
              positions={committed}
              pathOptions={{ color: MAP_COLORS.area, weight: 2, dashArray: '6 4' }}
            />
          ))}

        {/* Draggable handles on the committed shape's vertices. */}
        {flat && !drawMode && !readOnly &&
          committed.map((position, index) => (
            <CircleMarker
              key={`geom-${index}`}
              center={position}
              radius={5}
              pathOptions={{ color: '#fff', weight: 2, fillColor: MAP_COLORS.area, fillOpacity: 1 }}
              eventHandlers={{
                mousedown: (event) => {
                  // Drag a vertex without the map panning underneath it.
                  L.DomEvent.stopPropagation(event);
                  const map = event.target._map;
                  map.dragging.disable();
                  const move = (moveEvent) =>
                    onMoveGeometryVertex?.(index, moveEvent.latlng.lat, moveEvent.latlng.lng);
                  const up = () => {
                    map.dragging.enable();
                    map.off('mousemove', move);
                    map.off('mouseup', up);
                  };
                  map.on('mousemove', move);
                  map.on('mouseup', up);
                },
              }}
            />
          ))}

        {/* The generated boustrophedon preview. */}
        {flat && generatedLines.map((line, index) => (
          <Polyline
            key={`gen-${index}`}
            positions={line}
            pathOptions={{ color: MAP_COLORS.generated, weight: 2, opacity: 0.9 }}
          />
        ))}

        {/* The shape being drawn right now. */}
        {draft.length > 0 && (
          <>
            <Polyline
              positions={draft}
              pathOptions={{ color: MAP_COLORS.generated, weight: 2, dashArray: '4 4' }}
            />
            {draft.map((position, index) => (
              <CircleMarker
                key={`draft-${index}`}
                center={position}
                radius={4}
                pathOptions={{
                  color: '#fff',
                  weight: 2,
                  fillColor: MAP_COLORS.generated,
                  fillOpacity: 1,
                }}
              />
            ))}
          </>
        )}

        {/* Committed free-standing annotations (points/lines/rectangles/circles). */}
        {flat && annotations.map((annotation) => {
          const key = annotation.id;
          const pathOptions = { color: annotation.color, weight: 2, fillOpacity: 0.15 };
          const label = annotation.label || null;
          if (annotation.kind === 'point') {
            return (
              <CircleMarker
                key={key}
                center={[annotation.geometry.lat, annotation.geometry.lng]}
                radius={6}
                pathOptions={{ ...pathOptions, fillColor: annotation.color, fillOpacity: 1 }}
              >
                <Popup>
                  <span className="text-xs">{label ?? 'Annotation'}</span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => deleteAnnotation(annotation.id)}
                      className="mt-1 block text-xs text-red-600 underline"
                    >
                      Delete
                    </button>
                  )}
                </Popup>
              </CircleMarker>
            );
          }
          if (annotation.kind === 'line') {
            return (
              <Polyline
                key={key}
                positions={annotation.geometry.map((p) => [p.lat, p.lng])}
                pathOptions={pathOptions}
              >
                {(label || !readOnly) && (
                  <Popup>
                    <span className="text-xs">{label ?? 'Annotation'}</span>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => deleteAnnotation(annotation.id)}
                        className="mt-1 block text-xs text-red-600 underline"
                      >
                        Delete
                      </button>
                    )}
                  </Popup>
                )}
              </Polyline>
            );
          }
          if (annotation.kind === 'rectangle') {
            const [a, b] = annotation.geometry;
            return (
              <Rectangle
                key={key}
                bounds={[
                  [a.lat, a.lng],
                  [b.lat, b.lng],
                ]}
                pathOptions={pathOptions}
              >
                {(label || !readOnly) && (
                  <Popup>
                    <span className="text-xs">{label ?? 'Annotation'}</span>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => deleteAnnotation(annotation.id)}
                        className="mt-1 block text-xs text-red-600 underline"
                      >
                        Delete
                      </button>
                    )}
                  </Popup>
                )}
              </Rectangle>
            );
          }
          // circle
          return (
            <Circle
              key={key}
              center={[annotation.geometry.center.lat, annotation.geometry.center.lng]}
              radius={annotation.geometry.radiusMeters}
              pathOptions={pathOptions}
            >
              {(label || !readOnly) && (
                <Popup>
                  <span className="text-xs">{label ?? 'Annotation'}</span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => deleteAnnotation(annotation.id)}
                      className="mt-1 block text-xs text-red-600 underline"
                    >
                      Delete
                    </button>
                  )}
                </Popup>
              )}
            </Circle>
          );
        })}

        {/* Read-only GEO Zone / Task Area overlays, DJI's yellow/green scheme. */}
        {flat && geoZones.map((zone) => {
          const color = zone.kind === 'task_area' ? MAP_COLORS.taskArea : MAP_COLORS.geoZone;
          return (
            <Polygon
              key={zone.id}
              positions={zone.vertices.map((p) => [p.lat, p.lng])}
              pathOptions={{ color, weight: 1.5, fillColor: color, fillOpacity: 0.18 }}
            >
              <Popup>
                <span className="text-xs">
                  {zone.name} ({zone.kind === 'task_area' ? 'Task Area' : 'GEO Zone'})
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => deleteGeoZone(zone.id)}
                    className="mt-1 block text-xs text-red-600 underline"
                  >
                    Delete
                  </button>
                )}
              </Popup>
            </Polygon>
          );
        })}

        {/* The annotation currently being placed (line/rectangle/circle mid-click). */}
        {flat && annotateDraft.length > 0 && (annotateMode === 'line' || annotateMode === 'zone') && (
          <Polyline
            positions={annotateDraft}
            pathOptions={{
              color: annotateMode === 'zone' ? MAP_COLORS.geoZone : MAP_COLORS.route,
              weight: 2,
              dashArray: '4 4',
            }}
          />
        )}
        {flat && annotateDraft.length === 1 && (annotateMode === 'rectangle' || annotateMode === 'circle') && (
          <CircleMarker
            center={annotateDraft[0]}
            radius={4}
            pathOptions={{ color: '#fff', weight: 2, fillColor: MAP_COLORS.route, fillOpacity: 1 }}
          />
        )}

        {/*
          Coverage and orientation are drawn before the route so the route line
          stays crisp on top of them. SVG paints in document order, and a 34%
          amber fill laid over the polyline tints it and costs the route its
          contrast — the reference keeps the line above the cone.
        */}
        {/*
          Camera coverage (docs/waypoint-camera-visuals.md §2).

          Two wedges per waypoint, drawn widest-first so the zoom wedge reads as
          sitting inside the wide one: an amber wide-lens footprint and a green
          footprint narrowed by that waypoint's zoom ratio. Each is a translucent
          fill, a near-opaque outline and a dashed centre arrow, matching how the
          reference composes them.

          Only aircraft with a measured field of view draw anything — see
          lib/camera.js. The menu explains the absence rather than faking it.
        */}
        {flat && display.displayCameraCoverage && coverageFov &&
          waypoints.map((waypoint, index) => {
            const heading = headingAt(waypoints, index, settings);
            const range = rangeFor(groundClearance(waypoint, settings));
            if (!range) return null;
            const zoomFov = zoomHFov(coverageFov, zoomRatioAt(waypoint, settings));
            const key = waypoint.id ?? index;

            return [
              { fov: coverageFov, color: MAP_COLORS.coverageWide, tag: 'wide' },
              { fov: zoomFov, color: MAP_COLORS.coverageZoom, tag: 'zoom' },
            ].map(({ fov, color, tag }) => {
              // A zoom of 1X makes the two wedges identical; drawing both just
              // doubles the fill and darkens it, so the inner one is skipped.
              if (tag === 'zoom' && fov >= coverageFov - 0.01) return null;
              return (
                <Fragment key={`cov-${tag}-${key}`}>
                  <Polygon
                    positions={coverageWedge(waypoint.lat, waypoint.lng, heading, fov, range)}
                    pathOptions={{
                      color,
                      weight: 1.5,
                      opacity: COVERAGE_OPACITY.outline,
                      fillColor: color,
                      fillOpacity: COVERAGE_OPACITY.fill,
                      interactive: false,
                    }}
                  />
                  <Polyline
                    positions={[
                      [waypoint.lat, waypoint.lng],
                      offsetLatLng(waypoint.lat, waypoint.lng, heading, range),
                    ]}
                    pathOptions={{
                      color,
                      weight: 1.5,
                      opacity: 1,
                      dashArray: '6 6',
                      interactive: false,
                    }}
                  />
                </Fragment>
              );
            });
          })}

        {/*
          Gimbal orientation (§4 of waypoint-camera-visuals). The reference places
          a small 3D fan model at every waypoint, oriented to that waypoint's
          world heading. Here it is a flat fan drawn on the ground, from the same
          heading the coverage wedges use.

          This replaces an earlier tick of our own invention that read the
          gimbalYaw action — a rendering the reference has no equivalent for, and
          one that was permanently inert on the M4TD, which has no such action.
        */}
        {flat && display.displayGimbalOrientation && (
          <GimbalOrientationLayer waypoints={waypoints} settings={settings} />
        )}

        {flat && positions.length > 1 && (
          <>
            {/* Casing beneath the route keeps it readable over pale tiles. */}
            <Polyline
              positions={positions}
              pathOptions={{
                color: MAP_COLORS.routeCasing,
                weight: display.boldLineMode ? 12 : 7,
                opacity: 0.85,
              }}
            />
            <Polyline
              positions={positions}
              pathOptions={{
                color: MAP_COLORS.route,
                weight: display.boldLineMode ? 6 : 3,
                opacity: 1,
              }}
            />
          </>
        )}

        {flat && takeoffPoint && (
          <Marker position={[takeoffPoint.lat, takeoffPoint.lng]} icon={takeoffIcon}>
            <Popup>
              <span className="text-xs">Reference takeoff point</span>
            </Popup>
          </Marker>
        )}

        {/*
          Vertical drop lines (§3). Without an elevation service there is no true
          ground point, so these are a fixed-length stub southward from each
          waypoint — an altitude cue, not a survey-accurate projection.
        */}
        {flat && display.displayVerticalLines &&
          waypoints.map((waypoint, index) => (
            <Polyline
              key={`vert-${waypoint.id ?? index}`}
              positions={[
                [waypoint.lat, waypoint.lng],
                offsetLatLng(waypoint.lat, waypoint.lng, 180, 25),
              ]}
              pathOptions={{
                color: MAP_COLORS.route,
                weight: 1.5,
                opacity: 0.55,
                dashArray: '3 3',
              }}
            />
          ))}

        {!flat || display.displayWaypoints === false ? null : waypoints.map((waypoint, index) => (
          <Marker
            key={waypoint.id ?? index}
            position={[waypoint.lat, waypoint.lng]}
            icon={waypointIcon(index, {
              selected: index === selectedIndex,
              isStart: index === 0,
              isEnd: index === waypoints.length - 1 && waypoints.length > 1,
              editing: index === editingIndex,
            })}
            draggable={!readOnly}
            eventHandlers={{
              click: (event) => {
                // Selecting a marker must not also drop a new waypoint.
                L.DomEvent.stopPropagation(event);
                onSelectWaypoint?.(index);
              },
              dragstart: () => onSelectWaypoint?.(index),
              drag: (event) => {
                const { lat, lng } = event.target.getLatLng();
                onMoveWaypoint?.(index, lat, lng);
              },
            }}
          />
        ))}

        {children}
      </MapContainer>
      </div>

      {is3D && (
        <>
          <Map3DOverlay
            map={mapRef.current}
            waypoints={waypoints}
            settings={settings}
            geometry={geometry}
            takeoffPoint={takeoffPoint}
            selectedIndex={selectedIndex}
            pitch={pitch}
            exaggeration={effectiveExaggeration}
            perspective={perspective}
            inset={PLANE_INSET}
            virtualFlight={virtualFlight}
            aircraftModel={aircraftModel}
          />

          {/* Interaction surface: our own pan, tilt and zoom while Leaflet's are off. */}
          <div
            className="absolute inset-0 z-[440] cursor-grab active:cursor-grabbing"
            onPointerDown={handle3DPointerDown}
            onPointerMove={handle3DPointerMove}
            onPointerUp={handle3DPointerUp}
            onPointerCancel={handle3DPointerUp}
            onWheel={handle3DWheel}
          />
        </>
      )}

      {/*
        Place search, top-left (feature-gap audit §"Map search tool"). Kept out
        of 3D mode along with the compass/readout: the tilted view's own
        screen-to-latlng math is unreliable under the CSS 3D transform (see the
        handleMapClick comment above), and flyTo would fight it.
      */}
      {!is3D && !readOnly && (
        <div className="pointer-events-none absolute left-3 top-3 z-[460]">
          <MapSearchBox
            onSelect={(result) => mapRef.current?.flyTo([result.lat, result.lng], 15)}
          />
        </div>
      )}

      {/* Map controls, kept outside the Leaflet container so they inherit app styling. */}
      <div className="pointer-events-none absolute right-3 top-3 z-[460] flex flex-col gap-2">
        {/* View mode. 3D tilts the ground plane so altitude becomes visible. */}
        <div className="pointer-events-auto flex overflow-hidden rounded-md border border-panel-700 bg-panel-900/95 p-0.5 shadow-lg">
          {[
            { mode: '2D', active: !is3D, onClick: exit3D, hint: 'Flat map view' },
            { mode: '3D', active: is3D, onClick: enter3D, hint: 'Tilted view — Ctrl + drag to tilt' },
          ].map((option) => (
            <button
              key={option.mode}
              type="button"
              onClick={option.onClick}
              title={option.hint}
              aria-pressed={option.active}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                option.active
                  ? 'bg-accent text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {option.mode}
            </button>
          ))}
        </div>

        {/* Virtual flight (FPV authoring) — see the block above for scope notes. */}
        {!readOnly && (
          <button
            type="button"
            onClick={() => (virtualFlight ? stopVirtualFlight() : startVirtualFlight())}
            title={
              virtualFlight
                ? 'Land — exit virtual flight'
                : 'Virtual Flight: fly a virtual aircraft with W/A/S/D, Q/E to yaw, C/Z for altitude, Space to drop a waypoint'
            }
            aria-pressed={!!virtualFlight}
            className={`pointer-events-auto rounded-md border p-2 shadow-lg transition-colors ${
              virtualFlight
                ? 'border-accent bg-accent text-white'
                : 'border-panel-700 bg-panel-900/95 text-slate-300 hover:bg-panel-700'
            }`}
          >
            <LuPlaneTakeoff className="h-4 w-4" />
          </button>
        )}

        <div className="pointer-events-auto flex flex-col overflow-hidden rounded-md border border-panel-700 bg-panel-900/95 shadow-lg">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            className="px-2.5 py-1.5 text-slate-300 transition-colors hover:bg-panel-700"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            className="border-t border-panel-700 px-2.5 py-1.5 text-slate-300 transition-colors hover:bg-panel-700"
            aria-label="Zoom out"
          >
            −
          </button>
        </div>

        <button
          type="button"
          onClick={fitRoute}
          disabled={!waypoints.length}
          title="Fit route to view"
          className="pointer-events-auto rounded-md border border-panel-700 bg-panel-900/95 p-2
            text-slate-300 shadow-lg transition-colors enabled:hover:bg-panel-700
            disabled:cursor-not-allowed disabled:text-slate-600"
        >
          <LuMaximize className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setBasemap((b) => (b === 'street' ? 'topo' : 'street'))}
          title={`Basemap: ${tiles.label} — click to switch`}
          className="pointer-events-auto rounded-md border border-panel-700 bg-panel-900/95 p-2
            text-slate-300 shadow-lg transition-colors hover:bg-panel-700"
        >
          <LuLayers className="h-4 w-4" />
        </button>

        {/*
          Annotation tools (feature-gap audit §"Map annotation, measurement,
          and rectangle/circle draw tools"), independent of the mapping-route
          drawMode above. Hidden read-only/3D, same as the other edit-only
          controls — see handleMapClick and the drawMode-priority effect.
        */}
        {!is3D && !readOnly && (
          <div className="pointer-events-auto flex flex-col overflow-hidden rounded-md border border-panel-700 bg-panel-900/95 shadow-lg">
            {[
              { mode: 'point', Icon: LuMapPinPlus, hint: 'Add a point annotation' },
              { mode: 'line', Icon: LuRuler, hint: 'Draw a line annotation (double-click to finish)' },
              { mode: 'rectangle', Icon: LuSquare, hint: 'Draw a rectangle annotation (click two corners)' },
              { mode: 'circle', Icon: LuCircle, hint: 'Draw a circle annotation (click centre, then edge)' },
              { mode: 'zone', Icon: LuShieldAlert, hint: 'Draw a GEO Zone (double-click to close, then name it)' },
            ].map(({ mode, Icon, hint }, index) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setAnnotateDraft([]);
                  setAnnotateMode((current) => (current === mode ? null : mode));
                }}
                title={hint}
                aria-pressed={annotateMode === mode}
                className={`p-2 transition-colors ${index > 0 ? 'border-t border-panel-700' : ''} ${
                  annotateMode === mode
                    ? 'bg-accent text-white'
                    : 'text-slate-300 hover:bg-panel-700'
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        )}

        {!is3D && <CompassWidget heading={selectedHeading} />}
      </div>

      {/*
        Persistent coordinate/altitude/datum readout (feature-gap audit
        §"coordinate/altitude reference display"). View-only, so it stays out of
        the way of the tilted-view's own Tilt/Altitude-scale panel in the same
        corner.
      */}
      {!is3D && (
        <div className="pointer-events-none absolute bottom-9 left-3 z-[460]">
          <div className="pointer-events-auto rounded-md border border-panel-700 bg-panel-900/95 px-2 py-1 text-[10px] text-slate-400 shadow-lg">
            {selectedWaypoint ? (
              <span className="font-mono text-slate-300">
                {(settings.heightMode ?? 'ASL')} {Math.round(heightAt(selectedWaypoint, settings))} m
              </span>
            ) : (
              <span>Select a waypoint for its altitude</span>
            )}
            <span className="mx-1.5 text-slate-600">·</span>
            <span>WGS 84</span>
          </div>
        </div>
      )}

      {is3D && (
        <div className="pointer-events-none absolute bottom-6 left-3 z-[460] flex flex-col gap-2">
          <div className="pointer-events-auto w-56 rounded-md border border-panel-700 bg-panel-900/95 p-2.5 shadow-lg">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
                <LuBox className="h-3.5 w-3.5 text-accent" />
                Tilt
              </span>
              <span className="font-mono text-[11px] text-slate-400">{Math.round(pitch)}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={MAX_PITCH}
              value={pitch}
              onChange={(event) => setPitch(clampPitch(Number(event.target.value)))}
              aria-label="Tilt"
              className="w-full"
            />

            <div className="mb-1.5 mt-2.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-slate-300">Altitude scale</span>
              <button
                type="button"
                onClick={() => setAutoScale(true)}
                disabled={autoScale}
                title="Fit the vertical scale to the view"
                className="font-mono text-[11px] text-slate-400 enabled:hover:text-accent disabled:text-accent"
              >
                {effectiveExaggeration}× {autoScale ? 'auto' : ''}
              </button>
            </div>
            <input
              type="range"
              min={MIN_EXAGGERATION}
              max={MAX_EXAGGERATION}
              step={1}
              value={effectiveExaggeration}
              onChange={(event) => {
                setAutoScale(false);
                setExaggeration(Number(event.target.value));
              }}
              aria-label="Altitude scale"
              className="w-full"
            />

            <p className="mt-2 text-[10px] leading-snug text-slate-500">
              {effectiveExaggeration > 1 ? (
                <>
                  Heights are exaggerated {effectiveExaggeration}× so the gap is readable — this is
                  not real clearance.
                </>
              ) : (
                'Heights shown at true scale.'
              )}
            </p>
            <p className="mt-1 text-[10px] leading-snug text-slate-500">
              Ctrl + drag to tilt · drag to pan · scroll to zoom
            </p>
          </div>
        </div>
      )}

      {is3D && !readOnly && !virtualFlight && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[460] flex justify-center">
          <div className="rounded-full border border-panel-600 bg-panel-900/95 px-4 py-1.5 text-xs text-slate-300 shadow-lg">
            3D is view only — switch to 2D to edit, or start Virtual Flight to add waypoints here
          </div>
        </div>
      )}

      {/*
        Virtual flight HUD (feature-gap audit §"Virtual-flight / FPV
        authoring"). Replaces the view-only banner above while flying — this
        mode IS an editing mode, unlike plain 3D. No live camera-preview image
        (no rendering pipeline for one — see the coverage cone in
        Map3DOverlay instead, which shows the same footprint DJI's preview
        would frame); the reference's Snapshot Preview / AI Spot-Check are
        the other pieces of §4/§6 this build was already documented as not
        replicating.
      */}
      {virtualFlight && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[460] flex justify-center">
          <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-full border border-accent/40 bg-panel-900/95 px-4 py-1.5 text-xs text-slate-200 shadow-lg">
            <span className="font-mono text-accent">
              ALT {Math.round(virtualFlight.height)} m · HDG {Math.round(virtualFlight.heading)}°
            </span>
            <span className="text-slate-500">
              W/A/S/D move · Q/E yaw · C/Z altitude · Space adds a waypoint · Esc lands
            </span>
            <button
              type="button"
              onClick={stopVirtualFlight}
              className="btn-ghost px-2 py-0.5 text-[11px]"
            >
              Land
            </button>
          </div>
        </div>
      )}

      {drawMode && (
        <div className="absolute inset-x-0 top-3 z-[400] flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-accent/40 bg-panel-900/95 px-4 py-1.5 text-xs text-slate-200 shadow-lg">
            <LuCrosshair className="h-3.5 w-3.5 shrink-0 text-accent" />
            <span>
              {drawMode === 'area'
                ? 'Click on map to draw a mapping area'
                : 'Click on map to draw flight band'}
              <span className="ml-1 text-slate-500">
                · double-click to finish · Esc to cancel
              </span>
            </span>
            <button
              type="button"
              onClick={() => onFinishDrawing?.()}
              disabled={draft.length < (drawMode === 'area' ? 3 : 2)}
              className="btn-primary px-2 py-0.5 text-[11px]"
            >
              Finish
            </button>
            <button
              type="button"
              onClick={() => onCancelDrawing?.()}
              className="btn-ghost px-2 py-0.5 text-[11px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {annotateMode && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[400] flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-accent/40 bg-panel-900/95 px-4 py-1.5 text-xs text-slate-200 shadow-lg">
            <LuCrosshair className="h-3.5 w-3.5 shrink-0 text-accent" />
            <span>
              {
                {
                  point: 'Click the map to place a point',
                  line: 'Click to add vertices',
                  rectangle: 'Click two opposite corners',
                  circle: 'Click the centre, then the edge',
                  zone: 'Click to add vertices for a GEO Zone',
                }[annotateMode]
              }
              {(annotateMode === 'line' || annotateMode === 'zone') && (
                <span className="ml-1 text-slate-500">· double-click to finish · Esc to cancel</span>
              )}
              {annotateMode !== 'line' && annotateMode !== 'zone' && annotateDraft.length > 0 && (
                <span className="ml-1 text-slate-500">· Esc to cancel</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                setAnnotateMode(null);
                setAnnotateDraft([]);
              }}
              className="btn-ghost px-2 py-0.5 text-[11px]"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {placementMode && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[400] flex justify-center">
          <div className="flex items-center gap-2 rounded-full border border-accent/40 bg-panel-900/95 px-4 py-1.5 text-xs text-slate-200 shadow-lg">
            <LuCrosshair className="h-3.5 w-3.5 text-accent" />
            {placementMode === 'takeoff'
              ? 'Click the map to set the reference takeoff point'
              : 'Click the map to place the point'}
          </div>
        </div>
      )}
    </div>
  );
}

export { bearingBetween };
