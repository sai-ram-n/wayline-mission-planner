/**
 * The tilted-view scene, drawn over the Leaflet container.
 *
 * Leaflet still owns the tiles and the map state; this draws the route on top,
 * with each waypoint lifted off the ground plane by its altitude so the vertical
 * gap between the flight path and the ground is visible.
 *
 * The projection here mirrors the CSS transform applied to the tiles — both come
 * from `lib/projection3d.js` — so the scene stays glued to the map as it pans,
 * zooms and tilts.
 */
import { useEffect, useMemo, useState } from 'react';

import { MAP_COLORS } from '../../lib/constants.js';
import { heightAt } from '../../lib/geo.js';
import { altitudeToPixels, project3d } from '../../lib/projection3d.js';

export default function Map3DOverlay({
  map,
  waypoints = [],
  settings = {},
  geometry = null,
  takeoffPoint = null,
  selectedIndex = null,
  pitch,
  exaggeration,
  perspective,
  /**
   * The map plane is drawn larger than the viewport in 3D, and waypoint
   * positions come from `latLngToContainerPoint` — which is relative to that
   * larger container. The overlay therefore has to sit on exactly the same
   * rectangle, or the route floats away from the tiles.
   */
  inset = 0,
}) {
  // Leaflet owns the view, so redraw whenever it changes underneath us. The
  // counter has to feed the memo below, or the scene is served from cache and
  // the route stays frozen while the map pans and zooms beneath it.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!map) return undefined;
    const redraw = () => setTick((n) => n + 1);
    const events = ['move', 'zoom', 'zoomanim', 'resize', 'viewreset'];
    events.forEach((event) => map.on(event, redraw));
    return () => events.forEach((event) => map.off(event, redraw));
  }, [map]);

  const scene = useMemo(() => {
    if (!map) return null;

    const size = map.getSize();
    const view = { width: size.x, height: size.y, pitch, perspective };
    const zoom = map.getZoom();

    /** A lat/lng plus an altitude in metres, projected onto the tilted plane. */
    const place = (lat, lng, metres) => {
      const point = map.latLngToContainerPoint([lat, lng]);
      const z = altitudeToPixels(metres, lat, zoom, exaggeration);
      const ground = project3d({ x: point.x, y: point.y, z: 0 }, view);
      const top = project3d({ x: point.x, y: point.y, z }, view);
      return { ground, top, z };
    };

    const points = waypoints.map((waypoint, index) => {
      const metres = heightAt(waypoint, settings);
      const { ground, top, z } = place(waypoint.lat, waypoint.lng, metres);
      return { index, waypoint, metres, ground, top, z };
    });

    const shape = (geometry?.vertices ?? []).map(([lat, lng]) => place(lat, lng, 0).ground);

    const takeoff = takeoffPoint
      ? place(takeoffPoint.lat, takeoffPoint.lng, 0).ground
      : null;

    return { view, points, shape, takeoff };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, waypoints, settings, geometry, takeoffPoint, pitch, exaggeration, perspective, tick]);

  if (!scene) return null;

  const { view, points, shape, takeoff } = scene;
  const visible = points.filter((p) => p.ground.visible && p.top.visible);

  const polyline = (list, accessor) =>
    list.map((p, i) => `${i === 0 ? 'M' : 'L'}${accessor(p).x.toFixed(1)},${accessor(p).y.toFixed(1)}`).join(' ');

  // Painter's algorithm: draw the far columns first so nearer ones overlap them.
  const byDepth = [...visible].sort((a, b) => a.ground.depth - b.ground.depth);

  return (
    <svg
      className="pointer-events-none absolute z-[450]"
      style={{ inset, width: view.width, height: view.height }}
      width={view.width}
      height={view.height}
      aria-hidden
    >
      {/* The drawn area or centre line, lying on the ground plane. */}
      {shape.length > 1 && (
        <path
          d={polyline(shape, (p) => p) + (geometry?.kind === 'area' ? ' Z' : '')}
          fill={geometry?.kind === 'area' ? MAP_COLORS.area : 'none'}
          fillOpacity={0.08}
          stroke={MAP_COLORS.area}
          strokeWidth={1.5}
          strokeDasharray={geometry?.kind === 'area' ? undefined : '6 4'}
        />
      )}

      {takeoff?.visible && (
        <rect
          x={takeoff.x - 5}
          y={takeoff.y - 5}
          width={10}
          height={10}
          rx={2}
          fill={MAP_COLORS.takeoff}
          stroke="rgba(255,255,255,.7)"
          strokeWidth={1.5}
        />
      )}

      {/* The ground track: where the route would be at zero altitude. */}
      {visible.length > 1 && (
        <path
          d={polyline(visible, (p) => p.ground)}
          fill="none"
          stroke={MAP_COLORS.route}
          strokeWidth={1.5}
          strokeOpacity={0.35}
          strokeDasharray="5 5"
        />
      )}

      {/*
        One column per waypoint — the gap this view exists to show. Drawn as a
        dark casing plus a coloured core so it stays legible over any tiles, and
        thick enough to read as structure rather than a stray hairline.
      */}
      {byDepth.map((p) => (
        <g key={`col-${p.waypoint.id ?? p.index}`}>
          <line
            x1={p.ground.x}
            y1={p.ground.y}
            x2={p.top.x}
            y2={p.top.y}
            stroke={MAP_COLORS.routeCasing}
            strokeWidth={4}
            strokeOpacity={0.5}
            strokeLinecap="round"
          />
          <line
            x1={p.ground.x}
            y1={p.ground.y}
            x2={p.top.x}
            y2={p.top.y}
            stroke={p.index === selectedIndex ? MAP_COLORS.markerSelected : MAP_COLORS.route}
            strokeWidth={2}
            strokeOpacity={0.95}
            strokeLinecap="round"
          />
        </g>
      ))}

      {byDepth.map((p) => (
        <ellipse
          key={`base-${p.waypoint.id ?? p.index}`}
          cx={p.ground.x}
          cy={p.ground.y}
          rx={5 * p.ground.scale}
          ry={5 * p.ground.scale * Math.cos((pitch * Math.PI) / 180)}
          fill="rgba(0,0,0,.45)"
          stroke={MAP_COLORS.route}
          strokeWidth={1.25}
          strokeOpacity={0.75}
        />
      ))}

      {/* The flight path itself, joining the waypoints at altitude. */}
      {visible.length > 1 && (
        <>
          <path
            d={polyline(visible, (p) => p.top)}
            fill="none"
            stroke={MAP_COLORS.routeCasing}
            strokeWidth={5}
            strokeOpacity={0.85}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={polyline(visible, (p) => p.top)}
            fill="none"
            stroke={MAP_COLORS.route}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}

      {/* Numbered markers, sized by their perspective scale. */}
      {byDepth.map((p) => {
        const isStart = p.index === 0;
        const isSelected = p.index === selectedIndex;
        const radius = Math.max(7, Math.min(16, 11 * p.top.scale));
        const fill = isSelected
          ? MAP_COLORS.markerSelected
          : isStart
            ? MAP_COLORS.start
            : MAP_COLORS.marker;

        return (
          <g key={`wp-${p.waypoint.id ?? p.index}`}>
            <circle
              cx={p.top.x}
              cy={p.top.y}
              r={radius}
              fill={fill}
              stroke={isSelected ? '#fff' : 'rgba(255,255,255,.55)'}
              strokeWidth={2}
            />
            <text
              x={p.top.x}
              y={p.top.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={Math.max(8, radius * 0.85)}
              fontWeight="600"
              fill="#06101c"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {isStart ? 'S' : p.index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
