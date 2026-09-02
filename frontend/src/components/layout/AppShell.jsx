import { NavLink } from 'react-router-dom';
import { LuMap, LuLibrary, LuPlane } from 'react-icons/lu';
import { VERSION, BUILD_DATE, APP_NAME } from '@version';

const NAV = [
  { to: '/editor', label: 'Editor', icon: LuMap, hint: 'Plan a mission on the map' },
  { to: '/library', label: 'Library', icon: LuLibrary, hint: 'Saved waylines' },
  { to: '/drones', label: 'Fleet', icon: LuPlane, hint: 'Drones and assignments' },
];

export default function AppShell({ children }) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-6 border-b border-panel-700 bg-panel-900 px-4 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight text-slate-100">{APP_NAME}</span>
          <span
            className="font-mono text-[11px] text-slate-500"
            title={`Built ${BUILD_DATE}`}
          >
            v{VERSION}
          </span>
        </div>

        <nav className="flex items-center gap-1">
          {NAV.map(({ to, label, icon: Icon, hint }) => (
            <NavLink
              key={to}
              to={to}
              title={hint}
              className={({ isActive }) =>
                // A left accent bar makes the active section readable at a glance,
                // rather than relying on a subtle background shade alone.
                `btn relative ${
                  isActive
                    ? 'bg-panel-700 text-slate-100 after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent'
                    : 'text-slate-400 hover:bg-panel-800 hover:text-slate-200'
                }`
              }
            >
              <Icon aria-hidden className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
