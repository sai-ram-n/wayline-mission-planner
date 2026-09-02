/**
 * The four mission metrics shown above the waypoint list, matching the labels
 * the reference editor uses: Flight Distance, Flight Duration, Waypoints, Photos.
 */
import { LuRuler, LuClock, LuMapPin, LuImage, LuShapes, LuSpline } from 'react-icons/lu';
import { formatArea, formatDistance, formatDuration } from '../../lib/geo.js';

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1" title={label}>
      <Icon aria-hidden className="h-3.5 w-3.5 text-slate-500" />
      <span className="truncate font-mono text-xs text-slate-200">{value}</span>
      <span className="truncate text-[10px] leading-tight text-slate-500">{label}</span>
    </div>
  );
}

/**
 * Mapping routes add their own leading metrics: an area route shows Area, and a
 * linear route shows the centre-line length as well (§8.1, §8.2).
 */
export default function StatsBar({ stats, area = null, centerLineLength = null }) {
  // Mapping routes add up to two extra metrics; past four they no longer fit on
  // one row of the side panel, so they wrap into a grid instead of being squashed.
  const extra = (area != null ? 1 : 0) + (centerLineLength != null ? 1 : 0);
  const layout =
    extra > 0
      ? 'grid grid-cols-3 gap-y-2'
      : 'flex items-start';

  return (
    <div className={`${layout} border-b border-panel-700 bg-panel-900 py-2`}>
      {centerLineLength != null && (
        <Stat icon={LuSpline} label="Centre Line" value={formatDistance(centerLineLength)} />
      )}
      {area != null && <Stat icon={LuShapes} label="Area" value={formatArea(area)} />}
      <Stat icon={LuRuler} label="Flight Distance" value={formatDistance(stats.distance)} />
      <Stat icon={LuClock} label="Flight Duration" value={formatDuration(stats.duration)} />
      <Stat icon={LuMapPin} label="Waypoints" value={stats.waypoints} />
      <Stat icon={LuImage} label="Photos" value={stats.photos} />
    </div>
  );
}
