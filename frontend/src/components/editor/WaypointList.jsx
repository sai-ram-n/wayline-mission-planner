/**
 * Waypoint list with reordering.
 *
 * Each row shows the index and one small icon per attached action, so the
 * mission's shape is readable at a glance — the layout the reference editor uses.
 *
 * Reordering uses pointer events rather than the native HTML5 drag-and-drop API:
 * pointer events work on touch devices, behave consistently across browsers, and
 * are testable. Rows are also focusable and respond to Alt+ArrowUp / Alt+ArrowDown,
 * so reordering does not depend on a pointer at all.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { LuGripVertical, LuTrash2 } from 'react-icons/lu';
import { ACTION_ICONS } from '../../lib/constants.js';

function ActionIcons({ actions, waypointIndex, selectedAction, isSelected, onSelectAction }) {
  if (!actions?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {actions.map((action, actionIndex) => {
        const Icon = ACTION_ICONS[action.action_type];
        const active = isSelected && selectedAction === actionIndex;
        return (
          <button
            key={action.id ?? actionIndex}
            type="button"
            title={action.action_type}
            onClick={(event) => {
              event.stopPropagation();
              onSelectAction(waypointIndex, actionIndex);
            }}
            className={`rounded-sm p-1 transition-colors ${
              active
                ? 'bg-accent text-white'
                : 'text-slate-400 hover:bg-panel-700 hover:text-slate-200'
            }`}
          >
            {Icon ? <Icon className="h-3 w-3" /> : <span className="text-[9px]">•</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function WaypointList({
  waypoints,
  selectedIndex,
  selectedAction,
  onSelect,
  onSelectAction,
  onRemove,
  onReorder,
  /** Index currently in "changing waypoint location" mode, or null. */
  editingIndex = null,
}) {
  // Rendered highlight state, plus refs holding the same values so the pointerup
  // handler can read them synchronously. The commit must not live inside a state
  // updater — updaters have to stay pure (React re-invokes them in StrictMode).
  const [dragIndex, setDragIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const dragRef = useRef(null);
  const dropRef = useRef(null);
  const rowRefs = useRef([]);

  const beginDrag = (index) => {
    dragRef.current = index;
    dropRef.current = index;
    setDragIndex(index);
    setDropIndex(index);
  };

  /** Which row sits under this viewport y position. */
  const rowAt = useCallback((clientY) => {
    const rows = rowRefs.current.filter(Boolean);
    for (let i = 0; i < rows.length; i += 1) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return i;
    }
    // Past either end: clamp so dragging beyond the list still lands sensibly.
    if (rows.length) {
      if (clientY < rows[0].getBoundingClientRect().top) return 0;
      return rows.length - 1;
    }
    return null;
  }, []);

  // Track the drag on the window so it survives the pointer leaving the list.
  useEffect(() => {
    if (dragIndex == null) return undefined;

    const handleMove = (event) => {
      const index = rowAt(event.clientY);
      if (index == null) return;
      dropRef.current = index;
      setDropIndex(index);
    };
    const handleUp = () => {
      const from = dragRef.current;
      const to = dropRef.current;
      dragRef.current = null;
      dropRef.current = null;
      setDragIndex(null);
      setDropIndex(null);
      if (from != null && to != null && from !== to) onReorder(from, to);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [dragIndex, onReorder, rowAt]);

  const handleKeyDown = (event, index) => {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault();
      onReorder(index, index - 1);
    } else if (event.key === 'ArrowDown' && index < waypoints.length - 1) {
      event.preventDefault();
      onReorder(index, index + 1);
    }
  };

  if (!waypoints.length) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-xs text-slate-500">Click the map to place your first waypoint.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-panel-800 select-none">
      {waypoints.map((waypoint, index) => {
        const isSelected = index === selectedIndex;
        const isDropTarget = dropIndex === index && dragIndex !== index;
        const isDragging = dragIndex === index;

        return (
          <li
            key={waypoint.id ?? index}
            ref={(el) => {
              rowRefs.current[index] = el;
            }}
            tabIndex={0}
            role="button"
            aria-label={`Waypoint ${index + 1}. Alt plus arrow keys to reorder.`}
            onClick={() => onSelect(index)}
            onKeyDown={(event) => {
              handleKeyDown(event, index);
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(index);
              }
            }}
            className={`group cursor-pointer px-2 py-1.5 transition-colors ${
              editingIndex === index
                ? 'bg-[#ff9500]/25'
                : isSelected
                  ? 'bg-panel-700/70'
                  : 'hover:bg-panel-800'
            } ${isDropTarget ? 'ring-1 ring-inset ring-accent' : ''} ${
              isDragging ? 'opacity-40' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  beginDrag(index);
                }}
                title="Drag to reorder (or focus the row and use Alt + arrow keys)"
                className="shrink-0 cursor-grab touch-none p-0.5 text-slate-600 active:cursor-grabbing group-hover:text-slate-500"
              >
                <LuGripVertical aria-hidden className="h-3.5 w-3.5" />
              </span>

              {/*
                A green downward triangle followed by the index, as the reference
                waypoint list draws it (m4td-waypoint-editor.md §5) — not a
                numbered circle.
              */}
              <span className="flex shrink-0 items-center gap-1">
                <span
                  aria-hidden
                  className={`inline-block h-0 w-0 border-x-[5px] border-t-[8px] border-x-transparent ${
                    editingIndex === index ? 'border-t-[#ff9500]' : 'border-t-mint'
                  }`}
                />
                <span className="text-[11px] font-medium text-slate-200">{index + 1}</span>
              </span>

              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-400">
                {Math.round(waypoint.height ?? 0)} m
                {waypoint.use_global_speed === false && waypoint.speed
                  ? ` · ${waypoint.speed} m/s`
                  : ''}
              </span>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(index);
                }}
                title="Delete waypoint"
                className="shrink-0 rounded p-1 text-slate-600 opacity-0 transition hover:bg-red-950 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
              >
                <LuTrash2 className="h-3 w-3" />
              </button>
            </div>

            {editingIndex === index && (
              <p className="mt-0.5 pl-9 text-[10px] text-[#ff9500]">Changing waypoint location</p>
            )}

            {waypoint.actions?.length > 0 && (
              <div className="mt-1 pl-9">
                <ActionIcons
                  actions={waypoint.actions}
                  waypointIndex={index}
                  selectedAction={selectedAction}
                  isSelected={isSelected}
                  onSelectAction={onSelectAction}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
