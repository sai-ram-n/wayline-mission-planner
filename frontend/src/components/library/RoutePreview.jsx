/**
 * Thumbnail of a saved route, drawn as an SVG polyline from the waypoint
 * coordinates the list endpoint returns.
 *
 * Generated rather than stored: no image files, no cache to invalidate, and the
 * thumbnail always matches the route as saved.
 */
import { routeToSvgPath } from '../../lib/geo.js';
import { MAP_COLORS } from '../../lib/constants.js';

const WIDTH = 160;
const HEIGHT = 90;

export default function RoutePreview({ path = [], className = '' }) {
  const d = routeToSvgPath(path, WIDTH, HEIGHT);

  if (!d) {
    return (
      <div
        className={`flex items-center justify-center rounded bg-panel-800 ${className}`}
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
      >
        <span className="text-[10px] text-slate-600">No route</span>
      </div>
    );
  }

  // The first coordinate is Point S; mark it so the direction of travel reads.
  const start = path[0];
  const lats = path.map((p) => p[0]);
  const lngs = path.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1e-6;
  const spanLng = maxLng - minLng || 1e-6;
  const scale = Math.min((WIDTH - 16) / spanLng, (HEIGHT - 16) / spanLat);
  const startX = 8 + (WIDTH - 16 - spanLng * scale) / 2 + (start[1] - minLng) * scale;
  const startY = 8 + (HEIGHT - 16 - spanLat * scale) / 2 + (maxLat - start[0]) * scale;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={`rounded bg-panel-800 ${className}`}
      role="img"
      aria-label={`Route preview with ${path.length} waypoints`}
    >
      <path
        d={d}
        fill="none"
        stroke={MAP_COLORS.routeCasing}
        strokeWidth={4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={d}
        fill="none"
        stroke={MAP_COLORS.route}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={startX} cy={startY} r={3.5} fill={MAP_COLORS.start} stroke="#0b1a2b" strokeWidth={1} />
    </svg>
  );
}
