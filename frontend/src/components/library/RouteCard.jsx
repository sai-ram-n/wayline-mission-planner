/**
 * One saved route in the library list — docs/feature-reference.md §2.
 *
 * Shows the name, aircraft model with a drone glyph, the last-updated timestamp,
 * a route-type icon, an inline rename pencil and the overflow menu.
 */
import { useEffect, useRef, useState } from 'react';
import {
  LuEllipsis,
  LuLock,
  LuLockOpen,
  LuPencil,
  LuPlane,
  LuCopy,
  LuFolderInput,
  LuDownload,
  LuTrash2,
  LuMapPin,
  LuSquareDashed,
  LuSpline,
} from 'react-icons/lu';

import RoutePreview from './RoutePreview.jsx';
import { ROUTE_TYPE_LABELS } from '../../lib/constants.js';

const ROUTE_TYPE_ICONS = {
  waypoint: LuMapPin,
  area: LuSquareDashed,
  linear: LuSpline,
};

/** "Updated at YYYY-MM-DD HH:MM:SS", the format the reference uses. */
function formatUpdated(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function OverflowMenu({ wayline, onRename, onMove, onDuplicate, onToggleLock, onDelete, onDownload }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const items = [
    { label: 'Rename', icon: LuPencil, action: onRename, disabled: wayline.locked },
    { label: 'Move', icon: LuFolderInput, action: onMove, disabled: wayline.locked },
    { label: 'Duplicate', icon: LuCopy, action: onDuplicate },
    { label: 'Download .kmz', icon: LuDownload, action: onDownload },
    {
      label: wayline.locked ? 'Unlock' : 'Lock',
      icon: wayline.locked ? LuLockOpen : LuLock,
      action: onToggleLock,
    },
    { label: 'Delete', icon: LuTrash2, action: onDelete, disabled: wayline.locked, danger: true },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="More actions"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
        className="btn-ghost p-1"
      >
        <LuEllipsis className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-md border border-panel-600 bg-panel-800 py-1 shadow-2xl">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              title={item.note ?? (item.disabled ? 'Unlock this route first' : undefined)}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                item.action?.();
              }}
              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                item.danger
                  ? 'text-red-400 enabled:hover:bg-red-950/50'
                  : 'text-slate-300 enabled:hover:bg-panel-700'
              }`}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RouteCard({
  wayline,
  modelLabel,
  selected,
  onSelect,
  onOpen,
  onRename,
  onMove,
  onDuplicate,
  onToggleLock,
  onDelete,
  onDownload,
  // Bulk-select checkbox (library toolbar), independent of `selected`/`onSelect`
  // which drive the single-route preview pane.
  checked = false,
  onToggleCheck,
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(wayline.name);

  const RouteIcon = ROUTE_TYPE_ICONS[wayline.route_type] ?? LuMapPin;

  const startRename = () => {
    setDraft(wayline.name);
    setRenaming(true);
  };

  const commitRename = () => {
    const name = draft.trim();
    setRenaming(false);
    if (name && name !== wayline.name) onRename(name);
  };

  return (
    <li
      onClick={() => onSelect(wayline.id)}
      onDoubleClick={() => onOpen(wayline.id)}
      className={`cursor-pointer rounded-md border p-2 transition-colors ${
        selected
          ? 'border-accent/60 bg-panel-700/60'
          : 'border-panel-700 bg-panel-900 hover:border-panel-600 hover:bg-panel-800'
      }`}
    >
      <div className="flex gap-2">
        {onToggleCheck && (
          <input
            type="checkbox"
            aria-label={`Select ${wayline.name} for bulk actions`}
            checked={checked}
            onClick={(event) => event.stopPropagation()}
            onChange={() => onToggleCheck(wayline.id)}
            className="mt-1 h-3.5 w-3.5 shrink-0 self-start"
          />
        )}
        <RoutePreview path={wayline.path} className="h-14 w-24 shrink-0" />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-start gap-1">
            {renaming ? (
              <input
                className="input min-w-0 flex-1 py-0.5 text-xs"
                value={draft}
                autoFocus
                maxLength={120}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitRename();
                  if (event.key === 'Escape') setRenaming(false);
                }}
              />
            ) : (
              <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-slate-100">
                {wayline.name}
              </h3>
            )}

            {wayline.locked && (
              <LuLock
                aria-label="Locked"
                title="Locked — read only"
                className="mt-0.5 h-3 w-3 shrink-0 text-amber-400"
              />
            )}

            {!renaming && (
              <button
                type="button"
                aria-label="Rename"
                title={wayline.locked ? 'Unlock this route first' : 'Rename'}
                disabled={wayline.locked}
                onClick={(event) => {
                  event.stopPropagation();
                  startRename();
                }}
                className="btn-ghost shrink-0 p-1"
              >
                <LuPencil className="h-3 w-3" />
              </button>
            )}

            <OverflowMenu
              wayline={wayline}
              onRename={startRename}
              onMove={onMove}
              onDuplicate={onDuplicate}
              onToggleLock={onToggleLock}
              onDelete={onDelete}
              onDownload={onDownload}
            />
          </div>

          <p className="flex items-center gap-1 truncate text-[10px] text-slate-400">
            <LuPlane aria-hidden className="h-3 w-3 shrink-0" />
            {modelLabel ?? wayline.aircraft_model}
            <span className="text-slate-600">·</span>
            <RouteIcon aria-hidden className="h-3 w-3 shrink-0" />
            {ROUTE_TYPE_LABELS[wayline.route_type] ?? wayline.route_type}
          </p>

          <p className="truncate text-[10px] text-slate-500">
            {wayline.waypoint_count} waypoints · Updated at {formatUpdated(wayline.updated_at)}
          </p>
        </div>
      </div>
    </li>
  );
}
