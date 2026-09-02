/**
 * Area and Linear route settings — docs/feature-reference.md §8.1 and §8.2.
 *
 * Every control and default here comes from those sections. Changing any of them
 * regenerates the route, so the panel doubles as the regeneration trigger; the
 * derived line spacing is shown so the effect of GSD and overlap is inspectable
 * rather than mysterious.
 */
import useMissionStore from '../../store.js';
import { lensesFor, LENS_LABELS } from '../../lib/actions.js';
import { footprint } from '../../lib/routegen.js';
import {
  ChipGroup,
  NumberStepper,
  SegmentedTabs,
  SelectField,
  Section,
  SliderField,
  ToggleField,
} from '../ui/Field.jsx';

const HINTS = {
  gsd: 'Ground sample distance — how much ground one pixel covers. A smaller value means a lower, more detailed flight.',
  sideOverlap: 'How much neighbouring flight lines overlap. Higher values fly more lines.',
  forwardOverlap: 'How much consecutive photos overlap along a line. Higher values shoot more often.',
  margin: 'Extends the surveyed area outward beyond the drawn boundary.',
  courseAngle: 'Direction the flight lines run, in degrees.',
  elevationOptimization: 'Improves elevation accuracy by capturing extra oblique frames at the edges.',
  terrainFollow: 'Global elevation data is for reference only. Fly with caution.',
  extension: 'How far the surveyed corridor reaches to each side of the centre line.',
  cutting: 'Long corridors are flown in sections of this length.',
  includeCenterLine: 'Adds one extra pass directly along the centre line.',
  zigzag: 'Zigzag fills the whole corridor. Single Route flies the centre line only.',
  photoMode: 'Whether captures are triggered on a time interval or a distance interval.',
  startPoint: 'Which end of the survey the route begins from. Coverage is unchanged.',
  flip: 'Fly the survey lines in the opposite order.',
};

export default function MappingSettingsPanel({ disabled = false, stats }) {
  const mission = useMissionStore((s) => s.mission);
  const meta = useMissionStore((s) => s.meta);
  const setSettings = useMissionStore((s) => s.setSettings);

  if (!meta) return null;

  const settings = mission.settings ?? {};
  const isLinear = mission.route_type === 'linear';
  const set = (key) => (value) => setSettings({ [key]: value });
  const options = (values, labels) =>
    values.map((value) => ({ value, label: labels?.[value] ?? value }));

  const lenses = lensesFor(meta, mission.aircraft_series, mission.aircraft_model, mission.route_type);
  const sensor =
    meta.mappingSensors?.[mission.aircraft_model] ?? meta.defaultMappingSensor ?? {
      width: 4000,
      height: 3000,
    };
  const { lineSpacing, photoSpacing, widthM } = footprint(settings, sensor);
  const hasIrSensor = lenses.includes('ir') && lenses.length > 1;
  const gsdLinked = settings.gsdLinked !== false;

  /** Left and right extensions move together while the link is on (§8.2). */
  const linked = settings.extensionsLinked !== false;
  const setExtension = (side) => (value) => {
    if (linked) setSettings({ leftExtension: value, rightExtension: value });
    else setSettings({ [side]: value });
  };

  return (
    <div className="text-slate-200">
      {/* --------------------------------------------------------- capture */}
      <Section title="Capture">
        {lenses.length > 0 && (
          <ChipGroup
            label="Select Lens"
            value={settings.lenses ?? []}
            options={lenses.map((lens) => ({ value: lens, label: LENS_LABELS[lens] ?? lens }))}
            onChange={set('lenses')}
            disabled={disabled}
            note={
              mission.aircraft_model === 'M30T'
                ? 'This aircraft offers Wide and IR for mapping — no Zoom.'
                : null
            }
          />
        )}

        {!isLinear && (
          <SegmentedTabs
            label="Photo Collection"
            value={settings.photoCollection ?? 'ortho'}
            options={[
              { value: 'ortho', label: 'Ortho' },
              { value: 'oblique', label: 'Oblique' },
            ]}
            onChange={set('photoCollection')}
            disabled={disabled}
          />
        )}

        <NumberStepper
          label={hasIrSensor ? `GSD (${LENS_LABELS[lenses[0]] ?? 'Visible'})` : 'GSD'}
          hint={HINTS.gsd}
          value={settings.gsd}
          onChange={(gsd) =>
            gsdLinked ? setSettings({ gsd, gsdIr: gsd }) : setSettings({ gsd })
          }
          min={0.1}
          max={100}
          steps={[0.1, 1]}
          unit="cm/px"
          disabled={disabled}
        />

        {/* A second GSD for the thermal sensor, coupled by a link toggle (§8.2). */}
        {hasIrSensor && (
          <>
            <ToggleField
              label="Link GSD values"
              value={gsdLinked}
              onChange={(v) =>
                setSettings(v ? { gsdLinked: true, gsdIr: settings.gsd } : { gsdLinked: false })
              }
              disabled={disabled}
            />
            <NumberStepper
              label="GSD (IR)"
              value={settings.gsdIr ?? settings.gsd}
              onChange={set('gsdIr')}
              min={0.1}
              max={100}
              steps={[0.1, 1]}
              unit="cm/px"
              disabled={disabled || gsdLinked}
            />
          </>
        )}

        {/* Derived numbers, so the settings above are not a black box. */}
        <dl className="rounded-md bg-panel-800 px-2 py-1.5 text-[10px] leading-relaxed text-slate-400">
          <div className="flex justify-between gap-2">
            <dt>Frame width</dt>
            <dd className="font-mono text-slate-300">{widthM.toFixed(0)} m</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Line spacing</dt>
            <dd className="font-mono text-slate-300">{lineSpacing.toFixed(1)} m</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Photo spacing</dt>
            <dd className="font-mono text-slate-300">{photoSpacing.toFixed(1)} m</dd>
          </div>
        </dl>
      </Section>

      {/* ----------------------------------------------------- flight lines */}
      <Section title={isLinear ? 'Corridor' : 'Flight lines'}>
        {isLinear ? (
          <>
            <SegmentedTabs
              label="Mode"
              hint={HINTS.zigzag}
              value={settings.zigzag === false ? 'single' : 'zigzag'}
              options={[
                { value: 'zigzag', label: 'Zigzag Route' },
                { value: 'single', label: 'Single Route' },
              ]}
              onChange={(value) => setSettings({ zigzag: value === 'zigzag' })}
              disabled={disabled}
            />

            <ToggleField
              label="Link left and right extensions"
              value={linked}
              onChange={(value) => setSettings({ extensionsLinked: value })}
              disabled={disabled}
            />
            <NumberStepper
              label="Left Extension Length"
              hint={HINTS.extension}
              value={settings.leftExtension}
              onChange={setExtension('leftExtension')}
              min={0}
              max={5000}
              steps={[10, 100]}
              unit="m"
              disabled={disabled}
            />
            <NumberStepper
              label="Right Extension Length"
              hint={HINTS.extension}
              value={settings.rightExtension}
              onChange={setExtension('rightExtension')}
              min={0}
              max={5000}
              steps={[10, 100]}
              unit="m"
              disabled={disabled}
            />

            <NumberStepper
              label="Cutting Distance"
              hint={HINTS.cutting}
              value={settings.cuttingDistance}
              onChange={set('cuttingDistance')}
              min={1}
              max={100000}
              steps={[100, 1000]}
              unit="m"
              disabled={disabled}
            />

            <SelectField
              label="Flight Route Direction"
              value={settings.directionMode ?? 'parallelToCenterLine'}
              options={[
                { value: 'parallelToCenterLine', label: 'Parallel to Center Line' },
                { value: 'perpendicularToCenterLine', label: 'Perpendicular to Center Line' },
              ]}
              onChange={set('directionMode')}
              disabled={disabled}
            />
          </>
        ) : (
          <>
            <SliderField
              label="Course Angle"
              hint={HINTS.courseAngle}
              value={settings.courseAngle ?? 0}
              onChange={set('courseAngle')}
              min={-180}
              max={180}
              unit="°"
              disabled={disabled}
            />
            <NumberStepper
              label="Margin"
              hint={HINTS.margin}
              value={settings.margin}
              onChange={set('margin')}
              min={0}
              max={1000}
              steps={[1, 10]}
              unit="m"
              disabled={disabled}
            />
          </>
        )}

        <SegmentedTabs
          label="Route Start Point"
          hint={HINTS.startPoint}
          value={settings.routeStartPoint ?? 'start'}
          options={[
            { value: 'start', label: 'Near corner' },
            { value: 'end', label: 'Far corner' },
          ]}
          onChange={set('routeStartPoint')}
          disabled={disabled}
        />

        <ToggleField
          label="Flip mapping area"
          hint={HINTS.flip}
          value={!!settings.flipArea}
          onChange={set('flipArea')}
          disabled={disabled}
        />

        <SegmentedTabs
          label="Waypoint Altitude Mode"
          value={settings.heightMode}
          options={meta.heightModes.map((value) => ({ value, label: value }))}
          onChange={set('heightMode')}
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
        <NumberStepper
          label="Safe Takeoff Altitude"
          value={settings.takeOffSecurityHeight}
          onChange={set('takeOffSecurityHeight')}
          min={1.5}
          max={1500}
          steps={[10, 100]}
          unit="m"
          disabled={disabled}
        />

        <ToggleField
          label="Elevation Optimization"
          hint={HINTS.elevationOptimization}
          value={!!settings.elevationOptimization}
          onChange={set('elevationOptimization')}
          disabled={disabled}
        />
        {isLinear && (
          <ToggleField
            label="Boundary Optimization"
            value={!!settings.boundaryOptimization}
            onChange={set('boundaryOptimization')}
            disabled={disabled}
          />
        )}

        {/*
          Terrain Follow File Management / Real-Time Terrain Follow (§8.1, §8.2).
          Shown but disabled: there is no elevation service wired up, so offering a
          working toggle would imply terrain data we do not have.
        */}
        <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-2">
          <ToggleField
            label="Real-Time Terrain Follow"
            value={false}
            onChange={() => {}}
            disabled
          />
          <p className="mt-1.5 text-[10px] leading-snug text-amber-300/90">
            Terrain following needs an elevation source, which this build does not include.
            Altitudes are flown as entered. Global elevation data is for reference only in any
            case — fly with caution.
          </p>
        </div>
      </Section>

      {/* ---------------------------------------------------------- advanced */}
      <Section title="Advanced settings" defaultOpen={false}>
        <NumberStepper
          label="Takeoff Speed"
          value={settings.globalTransitionalSpeed}
          onChange={set('globalTransitionalSpeed')}
          min={1}
          max={15}
          unit="m/s"
          disabled={disabled}
        />
        <NumberStepper
          label="Side Overlap Rate"
          hint={HINTS.sideOverlap}
          value={settings.sideOverlapRate}
          onChange={set('sideOverlapRate')}
          min={0}
          max={95}
          steps={[1, 10]}
          unit="%"
          disabled={disabled}
        />
        <NumberStepper
          label="Forward Overlap Rate"
          hint={HINTS.forwardOverlap}
          value={settings.forwardOverlapRate}
          onChange={set('forwardOverlapRate')}
          min={0}
          max={95}
          steps={[1, 10]}
          unit="%"
          disabled={disabled}
        />

        <SegmentedTabs
          label="Photo Mode"
          hint={HINTS.photoMode}
          value={settings.photoMode ?? 'timeInterval'}
          options={options(meta.photoModes, {
            timeInterval: 'Timed Interval',
            distanceInterval: 'Distance Interval',
          })}
          onChange={set('photoMode')}
          disabled={disabled}
        />

        {isLinear ? (
          <ToggleField
            label="Include Center Line"
            hint={HINTS.includeCenterLine}
            value={!!settings.includeCenterLine}
            onChange={set('includeCenterLine')}
            disabled={disabled}
          />
        ) : (
          <ToggleField
            label="Custom Camera Angle"
            value={!!settings.customCameraAngle}
            onChange={set('customCameraAngle')}
            disabled={disabled}
          />
        )}

        <SelectField
          label="Upon Completion"
          value={settings.finishAction}
          options={options(meta.finishActions, meta.finishActionLabels)}
          onChange={set('finishAction')}
          disabled={disabled}
        />
      </Section>
    </div>
  );
}
