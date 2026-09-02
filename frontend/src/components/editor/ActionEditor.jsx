/**
 * Waypoint action editor — docs/feature-reference.md §6.
 *
 * Shows the actions attached to the selected waypoint, an `< n-m >` pager and a
 * per-action delete, the parameter editor for the selected action, and the
 * add-action menu.
 *
 * Two rules from §6 are enforced here rather than left to the user:
 *   1. Take Photo cannot be attached while the camera is recording. The reference
 *      editor refuses this silently; we disable the entry and say why.
 *   2. With Follow Route on, the action inherits the route's Camera Settings and
 *      the per-action lens chips are disabled.
 */
import { useState } from 'react';
import { LuChevronLeft, LuChevronRight, LuPencil, LuPlus, LuTrash2, LuCheck, LuX } from 'react-icons/lu';

import useMissionStore from '../../store.js';
import { ACTION_ICONS } from '../../lib/constants.js';
import {
  ACTION_MENU,
  ATTITUDE_ACTIONS,
  FILENAME_TEMPLATES,
  LENS_LABELS,
  QUICK_ACTIONS,
  actionAvailability,
  cameraStateAt,
  defaultParams,
  lensesFor,
} from '../../lib/actions.js';
import {
  ChipGroup,
  FieldLabel,
  NumberStepper,
  SelectField,
  Section,
  SliderField,
  ToggleField,
} from '../ui/Field.jsx';

/* ------------------------------------------------------------------ file name */

/**
 * The capture file-name template with a pencil that reveals an inline suffix
 * editor, confirmed with ✓ or abandoned with ✗ — the control described in §6.
 */
function FileNameField({ label, template, value, onChange, disabled }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  const start = () => {
    setDraft(value ?? '');
    setEditing(true);
  };

  if (!editing) {
    return (
      <div>
        <FieldLabel>{label}</FieldLabel>
        <div className="flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded bg-panel-800 px-2 py-1 font-mono text-[11px] text-slate-300">
            {template}
            {value}
          </code>
          <button
            type="button"
            onClick={start}
            disabled={disabled}
            title="Edit the file-name suffix"
            className="btn-ghost shrink-0 p-1"
          >
            <LuPencil className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-1.5">
        <input
          className="input min-w-0 flex-1 py-1 font-mono text-[11px]"
          value={draft}
          autoFocus
          maxLength={60}
          placeholder="suffix"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onChange(draft);
              setEditing(false);
            } else if (e.key === 'Escape') {
              setEditing(false);
            }
          }}
        />
        <button
          type="button"
          title="Apply"
          onClick={() => {
            onChange(draft);
            setEditing(false);
          }}
          className="btn-ghost shrink-0 p-1 text-emerald-400"
        >
          <LuCheck className="h-3 w-3" />
        </button>
        <button
          type="button"
          title="Cancel"
          onClick={() => setEditing(false)}
          className="btn-ghost shrink-0 p-1"
        >
          <LuX className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- media block */

/** File name + lens chips + Follow Route, shared by the capture actions (§6). */
function MediaParams({ actionType, params, onChange, lenses, disabled }) {
  const followRoute = !!params.followRoute;
  return (
    <>
      <FileNameField
        label={actionType === 'createFolder' ? 'New Folder Name' : 'File name'}
        template={FILENAME_TEMPLATES[actionType] ?? ''}
        value={params.fileSuffix ?? ''}
        onChange={(fileSuffix) => onChange({ fileSuffix })}
        disabled={disabled}
      />

      <ToggleField
        label="Follow Route"
        hint="Use the route's Camera Settings for this action instead of choosing sensors here."
        value={followRoute}
        onChange={(value) => onChange({ followRoute: value })}
        disabled={disabled}
      />

      <ChipGroup
        label="Lenses"
        value={params.lenses ?? []}
        options={lenses.map((lens) => ({ value: lens, label: LENS_LABELS[lens] ?? lens }))}
        onChange={(value) => onChange({ lenses: value })}
        disabled={disabled || followRoute}
        note={followRoute ? 'Inherited from the route’s Camera Settings.' : null}
      />
    </>
  );
}

/* ---------------------------------------------------------- parameter editors */

function ActionParams({ action, onChange, lenses, disabled }) {
  const params = action.params ?? {};
  const type = action.action_type;

  switch (type) {
    case 'rotateYaw':
      return (
        <>
          <SliderField
            label="Aircraft Heading"
            value={params.aircraftHeading ?? 0}
            onChange={(aircraftHeading) => onChange({ aircraftHeading })}
            min={-180}
            max={180}
            unit="°"
            disabled={disabled}
          />
          <SelectField
            label="Rotation direction"
            value={params.aircraftPathMode ?? 'counterClockwise'}
            options={[
              { value: 'counterClockwise', label: 'Counter-clockwise' },
              { value: 'clockwise', label: 'Clockwise' },
            ]}
            onChange={(aircraftPathMode) => onChange({ aircraftPathMode })}
            disabled={disabled}
          />
        </>
      );

    case 'gimbalYaw':
      return (
        <SliderField
          label="Gimbal Yaw"
          value={params.angle ?? 0}
          onChange={(angle) => onChange({ angle })}
          min={-180}
          max={180}
          unit="°"
          disabled={disabled}
        />
      );

    case 'gimbalTilt':
      // The reference records the default (0°) but not the travel limits; this is
      // the conventional gimbal pitch range, down 90° and up 30°.
      return (
        <SliderField
          label="Gimbal Tilt"
          value={params.angle ?? 0}
          onChange={(angle) => onChange({ angle })}
          min={-90}
          max={30}
          unit="°"
          disabled={disabled}
        />
      );

    case 'zoom':
      return (
        <SliderField
          label="Zoom Ratio"
          value={params.zoomRatio ?? 5}
          onChange={(zoomRatio) => onChange({ zoomRatio })}
          min={1}
          max={200}
          unit="×"
          disabled={disabled}
        />
      );

    case 'hover':
      return (
        <NumberStepper
          label="Hover Duration"
          hint="Counts toward the estimated flight duration."
          value={params.hoverTime ?? 10}
          onChange={(hoverTime) => onChange({ hoverTime })}
          min={1}
          max={3600}
          steps={[1, 10, 100]}
          unit="s"
          disabled={disabled}
        />
      );

    case 'startTimedShoot':
      return (
        <>
          <NumberStepper
            label="Time Interval"
            value={params.interval ?? 3}
            onChange={(interval) => onChange({ interval })}
            min={0.5}
            max={3600}
            steps={[1, 10, 100]}
            unit="s"
            disabled={disabled}
          />
          <MediaParams
            actionType={type}
            params={params}
            onChange={onChange}
            lenses={lenses}
            disabled={disabled}
          />
        </>
      );

    case 'startDistanceShoot':
      return (
        <>
          <NumberStepper
            label="Distance Interval"
            value={params.interval ?? 10}
            onChange={(interval) => onChange({ interval })}
            min={0.5}
            max={10000}
            steps={[1, 10, 100]}
            unit="m"
            disabled={disabled}
          />
          <MediaParams
            actionType={type}
            params={params}
            onChange={onChange}
            lenses={lenses}
            disabled={disabled}
          />
        </>
      );

    case 'takePhoto':
    case 'takePhotoFixedAngle':
    case 'startRecord':
      return (
        <MediaParams
          actionType={type}
          params={params}
          onChange={onChange}
          lenses={lenses}
          disabled={disabled}
        />
      );

    case 'createFolder':
      return (
        <FileNameField
          label="New Folder Name"
          template={FILENAME_TEMPLATES.createFolder}
          value={params.folderName ?? ''}
          onChange={(folderName) => onChange({ folderName })}
          disabled={disabled}
        />
      );

    default:
      return (
        <p className="text-[11px] leading-snug text-slate-500">
          This action has no parameters.
        </p>
      );
  }
}

/* ------------------------------------------------------------------ add menu */

function AddActionMenu({ entries, onAdd, disabled }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="btn-secondary w-full px-2 py-1 text-xs"
      >
        <LuPlus className="h-3.5 w-3.5" />
        Add action
      </button>

      {open && (
        <>
          {/* Click-away layer, so the menu closes like the reference fly-out. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-1 max-h-80 w-full overflow-y-auto rounded-md border border-panel-600 bg-panel-800 py-1 shadow-2xl">
            {entries.map(({ type, label, allowed, reason }) => {
              const Icon = ACTION_ICONS[type];
              return (
                <button
                  key={type}
                  type="button"
                  disabled={!allowed}
                  title={reason ?? label}
                  onClick={() => {
                    onAdd(type);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-xs text-slate-300 transition-colors enabled:hover:bg-panel-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {Icon && <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{label}</span>
                    {!allowed && reason && (
                      <span className="block text-[10px] leading-snug text-amber-400/80">
                        {reason}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- editor */

export default function ActionEditor({ waypointIndex, disabled = false }) {
  const mission = useMissionStore((s) => s.mission);
  const meta = useMissionStore((s) => s.meta);
  const selectedAction = useMissionStore((s) => s.selectedAction);
  const selectAction = useMissionStore((s) => s.selectAction);
  const addAction = useMissionStore((s) => s.addAction);
  const updateAction = useMissionStore((s) => s.updateAction);
  const removeAction = useMissionStore((s) => s.removeAction);
  const setSyncedAttitude = useMissionStore((s) => s.recordCurrentAttitude);

  const waypoint = mission.waypoints[waypointIndex];
  if (!waypoint || !meta) return null;

  const actions = waypoint.actions ?? [];
  const settings = mission.settings ?? {};
  const lenses = lensesFor(meta, mission.aircraft_series, mission.aircraft_model, mission.route_type);

  // Availability is judged at the end of this waypoint's action list — the point
  // a newly added action would occupy.
  const state = cameraStateAt(mission.waypoints, waypointIndex);
  const context = { routeType: mission.route_type, aircraftSeries: mission.aircraft_series };

  const entryFor = (type) => {
    const { allowed, reason } = actionAvailability(type, state, context);
    return { type, label: meta.actionLabels[type] ?? type, allowed, reason };
  };

  const menuEntries = ACTION_MENU.map(entryFor);
  const quickEntries = QUICK_ACTIONS.map(entryFor);

  const index = selectedAction != null && actions[selectedAction] ? selectedAction : null;
  const action = index != null ? actions[index] : null;
  const Icon = action ? ACTION_ICONS[action.action_type] : null;

  const handleAdd = (type) => addAction(waypointIndex, type, defaultParams(type, settings));

  return (
    <Section title="Actions" defaultOpen>
      {/* quick actions strip */}
      <div className="flex flex-wrap gap-1">
        {quickEntries.map(({ type, label, allowed, reason }) => {
          const QuickIcon = ACTION_ICONS[type];
          return (
            <button
              key={type}
              type="button"
              disabled={disabled || !allowed}
              title={reason ?? label}
              onClick={() => handleAdd(type)}
              className="btn-secondary px-2 py-1 text-[10px]"
            >
              {QuickIcon && <QuickIcon className="h-3 w-3" />}
              {label}
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          title="Re-capture heading, gimbal angles and zoom as actions on this waypoint"
          onClick={() => setSyncedAttitude(waypointIndex)}
          className="btn-secondary px-2 py-1 text-[10px]"
        >
          Record Attitude
        </button>
      </div>

      {actions.length === 0 ? (
        <p className="text-[11px] leading-snug text-slate-500">
          No actions on this waypoint yet.
        </p>
      ) : (
        <>
          {/* pager header: icon, name, < n-m >, delete */}
          <div className="flex items-center gap-1.5 rounded-md bg-panel-800 px-2 py-1.5">
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />}
            <span className="min-w-0 flex-1 truncate text-xs text-slate-200">
              {action ? meta.actionLabels[action.action_type] : 'Select an action'}
            </span>

            <button
              type="button"
              title="Previous action"
              disabled={index == null || index === 0}
              onClick={() => selectAction(waypointIndex, (index ?? 0) - 1)}
              className="btn-ghost p-0.5"
            >
              <LuChevronLeft className="h-3 w-3" />
            </button>
            <span className="font-mono text-[10px] text-slate-500">
              {index == null ? '–' : `${waypointIndex + 1}-${index + 1}`}
            </span>
            <button
              type="button"
              title="Next action"
              disabled={index == null || index >= actions.length - 1}
              onClick={() => selectAction(waypointIndex, (index ?? 0) + 1)}
              className="btn-ghost p-0.5"
            >
              <LuChevronRight className="h-3 w-3" />
            </button>

            <button
              type="button"
              title="Delete action"
              disabled={disabled || index == null}
              onClick={() => removeAction(waypointIndex, index)}
              className="btn-ghost p-0.5 text-slate-500 hover:text-red-400"
            >
              <LuTrash2 className="h-3 w-3" />
            </button>
          </div>

          {action ? (
            <div className="space-y-3">
              <ActionParams
                action={action}
                lenses={lenses}
                disabled={disabled}
                onChange={(params) => updateAction(waypointIndex, index, params)}
              />
              {ATTITUDE_ACTIONS.includes(action.action_type) && (
                <p className="text-[10px] leading-snug text-slate-500">
                  Added automatically with the waypoint while “synchronize attitude” is on.
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => selectAction(waypointIndex, 0)}
              className="btn-ghost w-full py-1 text-[11px]"
            >
              Select the first action to edit it
            </button>
          )}
        </>
      )}

      <AddActionMenu entries={menuEntries} onAdd={handleAdd} disabled={disabled} />
    </Section>
  );
}
