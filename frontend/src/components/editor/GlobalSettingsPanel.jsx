/**
 * Route-level settings — the "Flight Route Settings" panel from
 * docs/feature-reference.md §5.
 *
 * Every control, default value and enum here is taken from that section, and the
 * enum values themselves come from /api/meta so the frontend never restates them.
 * Tooltip text is our own wording of the guidance captured during exploration.
 */
import useMissionStore from '../../store.js';
import { lensesFor, LENS_LABELS } from '../../lib/actions.js';
import {
  ChipGroup,
  NumberStepper,
  SegmentedTabs,
  SelectField,
  Section,
  ToggleField,
} from '../ui/Field.jsx';

/** Reworded from the tooltips captured in §5 — the meaning, not the source text. */
const HINTS = {
  headingMode:
    'Along Route: the aircraft faces the next waypoint. Manual: you steer the heading in flight. ' +
    'Lock Yaw Axis: the aircraft holds the heading it had at the previous waypoint.',
  gimbalPitchMode:
    'Manual: you control gimbal tilt in flight, and it holds the previous waypoint’s angle until ' +
    'you change it. For Each Waypoint: tilt eases evenly from one waypoint to the next.',
  finishAction:
    'What the aircraft does when the route ends. In every case, the signal-lost action still ' +
    'applies if the aircraft loses its link.',
  flyToWaylineMode:
    'Direct Ascent: climb straight to the first waypoint’s altitude. Safe Takeoff: climb to the ' +
    'safe altitude first, then fly to the start point.',
  heightMode:
    'ASL is height above sea level, ALT is relative to the takeoff point, and AGL follows the ' +
    'terrain below the aircraft.',
  turnMode: 'How the aircraft behaves as it passes through each waypoint.',
  takeOffSecurityHeight:
    'With Safe Takeoff, the aircraft climbs to this altitude before heading for the start point.',
  globalTransitionalSpeed:
    'Speed used flying to the start point and back home, separate from the route speed.',
  lenses: 'Which of the payload’s sensors capture media along this route.',
  smartLowLight: 'Lengthens exposure in poor light. Best left off for fast-moving routes.',
  syncAttitude:
    'Capture the current aircraft heading, gimbal angles and zoom as actions whenever a new ' +
    'waypoint is added.',
};

export default function GlobalSettingsPanel({ disabled = false }) {
  const mission = useMissionStore((s) => s.mission);
  const meta = useMissionStore((s) => s.meta);
  const setSettings = useMissionStore((s) => s.setSettings);

  if (!meta) return null;

  const settings = mission.settings ?? {};
  const set = (key) => (value) => setSettings({ [key]: value });

  const modelEntry = meta.aircraft?.[mission.aircraft_series]?.models?.[mission.aircraft_model];
  const lenses = lensesFor(meta, mission.aircraft_series, mission.aircraft_model, mission.route_type);
  const options = (values, labels) =>
    values.map((value) => ({ value, label: labels?.[value] ?? value }));

  return (
    <div className="text-slate-200">
      {/* -------------------------------------------------------------- camera */}
      {lenses.length > 0 && (
        <Section title="Camera">
          <ChipGroup
            label="Camera Settings"
            hint={HINTS.lenses}
            value={settings.lenses ?? []}
            options={lenses.map((lens) => ({ value: lens, label: LENS_LABELS[lens] ?? lens }))}
            onChange={set('lenses')}
            disabled={disabled}
            note="At least one sensor stays selected."
          />
          {modelEntry?.smartLowLight && (
            <ToggleField
              label="Smart Low-Light"
              hint={HINTS.smartLowLight}
              value={!!settings.smartLowLight}
              onChange={set('smartLowLight')}
              disabled={disabled}
            />
          )}
        </Section>
      )}

      {/* ------------------------------------------------------------- takeoff */}
      <Section title="Takeoff and altitude">
        <SegmentedTabs
          label="Takeoff behaviour"
          hint={HINTS.flyToWaylineMode}
          value={settings.flyToWaylineMode}
          // Direct Ascent first, the order the reference uses and the default (§5).
          options={options(
            ['pointToPoint', 'safely'].filter((m) => meta.flyToWaylineModes.includes(m)),
            meta.flyToWaylineModeLabels
          )}
          onChange={set('flyToWaylineMode')}
          disabled={disabled}
        />

        <NumberStepper
          label="Safe Takeoff Altitude"
          hint={HINTS.takeOffSecurityHeight}
          value={settings.takeOffSecurityHeight}
          onChange={set('takeOffSecurityHeight')}
          min={1.5}
          max={1500}
          steps={[10, 100]}
          unit="m"
          disabled={disabled || settings.flyToWaylineMode !== 'safely'}
        />

        <SegmentedTabs
          label="Waypoint Altitude Mode"
          hint={HINTS.heightMode}
          value={settings.heightMode}
          options={meta.heightModes.map((value) => ({ value, label: value }))}
          onChange={set('heightMode')}
          disabled={disabled}
        />

        <NumberStepper
          label="Global Altitude"
          value={settings.globalHeight}
          onChange={set('globalHeight')}
          min={-200}
          max={1500}
          steps={[10, 100]}
          unit="m"
          disabled={disabled}
        />

        <NumberStepper
          label="Global Flight Speed"
          value={settings.autoFlightSpeed}
          onChange={set('autoFlightSpeed')}
          min={1}
          max={15}
          unit="m/s"
          disabled={disabled}
        />
      </Section>

      {/* ------------------------------------------------------------ advanced */}
      <Section title="Advanced settings" defaultOpen={false}>
        <NumberStepper
          label="Takeoff Speed"
          hint={HINTS.globalTransitionalSpeed}
          value={settings.globalTransitionalSpeed}
          onChange={set('globalTransitionalSpeed')}
          min={1}
          max={15}
          unit="m/s"
          disabled={disabled}
        />

        <NumberStepper
          label="Return-to-Home Altitude"
          value={settings.globalRTHHeight}
          onChange={set('globalRTHHeight')}
          min={20}
          max={1500}
          steps={[10, 100]}
          unit="m"
          disabled={disabled}
        />

        <SelectField
          label="Waypoint Type"
          hint={HINTS.turnMode}
          value={settings.turnMode}
          options={options(meta.turnModes, meta.turnModeLabels)}
          onChange={set('turnMode')}
          disabled={disabled}
        />

        <SelectField
          label="Aircraft Yaw"
          hint={HINTS.headingMode}
          value={settings.headingMode}
          // Point of Interest is a per-waypoint choice, not a route-wide one.
          options={options(
            meta.headingModes.filter((m) => m !== 'towardPOI'),
            meta.headingModeLabels
          )}
          onChange={set('headingMode')}
          disabled={disabled}
        />

        <SelectField
          label="Gimbal Control"
          hint={HINTS.gimbalPitchMode}
          value={settings.gimbalPitchMode}
          options={options(meta.gimbalPitchModes, meta.gimbalPitchModeLabels)}
          onChange={set('gimbalPitchMode')}
          disabled={disabled}
        />

        <SelectField
          label="Upon Completion"
          hint={HINTS.finishAction}
          value={settings.finishAction}
          options={options(meta.finishActions, meta.finishActionLabels)}
          onChange={set('finishAction')}
          disabled={disabled}
        />

        {/* Last row of Advanced Settings on M4-series aircraft (§3). */}
        {modelEntry?.bypassObstacle && (
          <ToggleField
            label="Bypass Obstacle"
            hint="Let the aircraft route around obstacles it detects along the flight path."
            value={!!settings.bypassObstacle}
            onChange={set('bypassObstacle')}
            disabled={disabled}
          />
        )}

        <ToggleField
          label="Synchronize attitude on new waypoint"
          hint={HINTS.syncAttitude}
          value={!!settings.syncAttitudeOnNewWaypoint}
          onChange={set('syncAttitudeOnNewWaypoint')}
          disabled={disabled}
        />
      </Section>
    </div>
  );
}
