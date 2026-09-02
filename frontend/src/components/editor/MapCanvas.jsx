/**
 * Leaflet map canvas for the mission editor.
 *
 * Click the map to append a waypoint, drag a marker to reposition it, click a
 * marker to select it. The route is drawn as a casing + line so it stays legible
 * over both street and terrain tiles.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { LuCrosshair, LuLayers, LuMaximize, LuUndo2 } from 'react-icons/lu';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAP_COLORS,
  TILE_LAYERS,
} from '../../lib/constants.js';
import { bearingBetween, offsetLatLng, waypointBounds } from '../../lib/geo.js';

/**
 * A numbered waypoint pin. Built as a divIcon so the index is real text —
 * readable, selectable and styleable without generating images.
 */
function waypointIcon(index, { selected, isStart, isEnd }) {
  const fill = selected ? MAP_COLORS.markerSelected : isStart ? MAP_COLORS.start : MAP_COLORS.marker;
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

/** Exposes the Leaflet instance so toolbar buttons can drive the map. */
function MapRefBridge({ onReady }) {
  const map = useMap();
  useEffect(() => onReady(map), [map, onReady]);
  return null;
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
}) {
  const [basemap, setBasemap] = useState('street');
  const mapRef = useRef(null);

  const positions = useMemo(() => waypoints.map((w) => [w.lat, w.lng]), [waypoints]);

  const handleMapClick = (latlng) => {
    if (readOnly) return;
    // A placement mode (e.g. "set takeoff point") consumes the next click.
    if (placementMode) {
      onPlacePoint?.(latlng, placementMode);
      return;
    }
    if (drawMode) {
      onDrawVertex?.(latlng);
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

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full bg-panel-950"
        zoomControl={false}
        attributionControl
      >
        <TileLayer url={tiles.url} attribution={tiles.attribution} maxZoom={tiles.maxZoom} />

        <MapRefBridge onReady={(m) => { mapRef.current = m; }} />
        <ClickHandler
          onMapClick={handleMapClick}
          onMapDoubleClick={() => onFinishDrawing?.()}
          drawing={!!drawMode}
        />
        <FitOnLoad waypoints={waypoints} trigger={fitTrigger} />

        {/* The surveyed area or corridor centre line, once committed. */}
        {committed.length > 1 &&
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
        {!drawMode && !readOnly &&
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
        {generatedLines.map((line, index) => (
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

        {positions.length > 1 && (
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

        {takeoffPoint && (
          <Marker position={[takeoffPoint.lat, takeoffPoint.lng]} icon={takeoffIcon}>
            <Popup>
              <span className="text-xs">Reference takeoff point</span>
            </Popup>
          </Marker>
        )}

        {/*
          Gimbal orientation ticks (§3). Drawn from the waypoint's gimbalYaw action
          where it has one, falling back to the route heading, so the tick shows
          roughly where the payload is looking.
        */}
        {display.displayGimbalOrientation &&
          waypoints.map((waypoint, index) => {
            const gimbal = (waypoint.actions ?? []).find((a) => a.action_type === 'gimbalYaw');
            const yaw = Number(gimbal?.params?.angle ?? 0);
            const heading =
              index < waypoints.length - 1
                ? bearingBetween(waypoint, waypoints[index + 1])
                : index > 0
                  ? bearingBetween(waypoints[index - 1], waypoint)
                  : 0;
            return (
              <Polyline
                key={`gimbal-${waypoint.id ?? index}`}
                positions={[
                  [waypoint.lat, waypoint.lng],
                  offsetLatLng(waypoint.lat, waypoint.lng, heading + yaw, 45),
                ]}
                pathOptions={{ color: MAP_COLORS.markerSelected, weight: 2, opacity: 0.9 }}
              />
            );
          })}

        {/*
          Vertical drop lines (§3). Without an elevation service there is no true
          ground point, so these are a fixed-length stub southward from each
          waypoint — an altitude cue, not a survey-accurate projection.
        */}
        {display.displayVerticalLines &&
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

        {display.displayWaypoints === false ? null : waypoints.map((waypoint, index) => (
          <Marker
            key={waypoint.id ?? index}
            position={[waypoint.lat, waypoint.lng]}
            icon={waypointIcon(index, {
              selected: index === selectedIndex,
              isStart: index === 0,
              isEnd: index === waypoints.length - 1 && waypoints.length > 1,
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

      {/* Map controls, kept outside the Leaflet container so they inherit app styling. */}
      <div className="pointer-events-none absolute right-3 top-3 z-[400] flex flex-col gap-2">
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
      </div>

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
