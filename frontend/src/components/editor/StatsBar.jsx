/**
 * The four mission metrics shown above the waypoint list, matching the labels
 * the reference editor uses: Flight Distance, Flight Duration, Waypoints, Photos.
 */
import { LuRuler, LuClock, LuMapPin, LuImage, LuShapes } from 'react-icons/lu';
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

export default function StatsBar({ stats, area = null }) {
  return (
    <div className="flex items-start border-b border-panel-700 bg-panel-900 py-2">
      {area != null && <Stat icon={LuShapes} label="Area" value={formatArea(area)} />}
      <Stat icon={LuRuler} label="Flight Distance" value={formatDistance(stats.distance)} />
      <Stat icon={LuClock} label="Flight Duration" value={formatDuration(stats.duration)} />
      <Stat icon={LuMapPin} label="Waypoints" value={stats.waypoints} />
      <Stat icon={LuImage} label="Photos" value={stats.photos} />
    </div>
  );
}
