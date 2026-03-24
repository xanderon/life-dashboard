'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import styles from './tricorder.module.css';

type Mode = {
  id: string;
  label: string;
  code: string;
  accent: string;
  display: DisplayKind;
  summary: string;
  detail: string;
  readouts: [string, string, string];
};

type DisplayKind = 'radar' | 'bio' | 'spectral' | 'terrain' | 'material';
type ThemeKind = 'starfleet' | 'nebula' | 'red-alert' | 'emerald';
type ControlKind = 'Sweep' | 'Pulse' | 'Wide' | 'Lock' | 'Stealth';

type ThemePreset = {
  id: ThemeKind;
  label: string;
  shellTop: string;
  shellBottom: string;
  hullTop: string;
  hullBottom: string;
  panelTop: string;
  panelBottom: string;
  glow: string;
};

type TargetStatus = 'Healthy' | 'Damaged' | 'Critical' | 'Dormant' | 'Shielded';

type TargetProfile = {
  id: string;
  name: string;
  type: string;
  status: TargetStatus;
  health: number;
  energy: number;
  stamina: number;
  signal: number;
  ghost: boolean;
  x: number;
  y: number;
  note: string;
};

type ContactView = 'hidden' | 'blip' | 'data';

const modes: Mode[] = [
  {
    id: 'bio',
    label: 'Bio Scan',
    code: 'MED-01',
    accent: '#ffd36b',
    display: 'bio',
    summary: 'Organic signatures, pulse rhythm, and micro-variance.',
    detail: 'Rhythmic mapping of living signals with focus on pulse, tissue density, and neural shimmer.',
    readouts: ['Pulse sync', 'Neural shimmer', 'Cell mesh'],
  },
  {
    id: 'env',
    label: 'Env Sweep',
    code: 'ATM-09',
    accent: '#69f0d1',
    display: 'radar',
    summary: 'Atmospheric mix, pressure shifts, and turbulence pockets.',
    detail: 'Sensors track thermal drift, volatile compounds, and local field instability.',
    readouts: ['Air mix', 'Pressure span', 'Thermal drift'],
  },
  {
    id: 'signal',
    label: 'Signal Trace',
    code: 'SIG-77',
    accent: '#7fb6ff',
    display: 'spectral',
    summary: 'Radio traces, interference, and weak carrier patterns.',
    detail: 'Narrow-band filtering exposes echoes, repeaters, and masked signal sources.',
    readouts: ['Carrier lock', 'Noise gate', 'Echo depth'],
  },
  {
    id: 'spectral',
    label: 'Spectral',
    code: 'SPC-42',
    accent: '#ff8bc8',
    display: 'spectral',
    summary: 'Energy spectrum and luminous anomalies.',
    detail: 'Separates short emissions from the background and surfaces rare pulse events.',
    readouts: ['Flux prism', 'Gamma lace', 'Phase split'],
  },
  {
    id: 'terrain',
    label: 'Terrain',
    code: 'GEO-18',
    accent: '#ff9f6d',
    display: 'terrain',
    summary: 'Texture, cavities, and local contour mapping.',
    detail: 'Rapid surface reconstruction for voids, edges, sublayers, and dense objects.',
    readouts: ['Depth map', 'Mass edge', 'Void ping'],
  },
  {
    id: 'material',
    label: 'Material Scan',
    code: 'MAT-31',
    accent: '#8cf07d',
    display: 'material',
    summary: 'Density, internal lattice, and composite signature.',
    detail: 'Fast classification for alloys, ceramics, composites, and hidden layered structures.',
    readouts: ['Lattice', 'Density', 'Alloy trace'],
  },
  {
    id: 'stellar',
    label: 'Stellar',
    code: 'AST-12',
    accent: '#bb98ff',
    display: 'radar',
    summary: 'Field vectors, orientation, and orbital pattern drift.',
    detail: 'Models field braids and vector drift for an imaginary bridge-grade navigation pass.',
    readouts: ['Field braid', 'Orbit skew', 'Vector calm'],
  },
  {
    id: 'interference',
    label: 'Interference',
    code: 'SUB-08',
    accent: '#67d6ff',
    display: 'spectral',
    summary: 'Interference, hidden fields, and phase fractures.',
    detail: 'Tracks irregular fluctuations and field knots that mask underlying signals.',
    readouts: ['Field noise', 'Phase ripple', 'Mask bleed'],
  },
];

const controlLabels: ControlKind[] = ['Sweep', 'Pulse', 'Wide', 'Lock', 'Stealth'];
const displayLabels: { id: DisplayKind; label: string }[] = [
  { id: 'radar', label: 'Radar' },
  { id: 'bio', label: 'Bio' },
  { id: 'spectral', label: 'Spectral' },
  { id: 'terrain', label: 'Terrain' },
  { id: 'material', label: 'Material' },
];
const themePresets: ThemePreset[] = [
  {
    id: 'starfleet',
    label: 'Starfleet',
    shellTop: '#11193a',
    shellBottom: '#070b16',
    hullTop: '#202a46',
    hullBottom: '#0a0f1d',
    panelTop: '#0f1b2d',
    panelBottom: '#060a14',
    glow: '#5ad7ff',
  },
  {
    id: 'nebula',
    label: 'Nebula',
    shellTop: '#28124c',
    shellBottom: '#090412',
    hullTop: '#36195f',
    hullBottom: '#10071c',
    panelTop: '#21103d',
    panelBottom: '#0c0618',
    glow: '#ff72d8',
  },
  {
    id: 'red-alert',
    label: 'Red Alert',
    shellTop: '#361016',
    shellBottom: '#0e0408',
    hullTop: '#4c171f',
    hullBottom: '#14070a',
    panelTop: '#2b0d14',
    panelBottom: '#110609',
    glow: '#ff7a63',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    shellTop: '#10251f',
    shellBottom: '#050b0a',
    hullTop: '#17382d',
    hullBottom: '#08120f',
    panelTop: '#0d1f1b',
    panelBottom: '#050d0b',
    glow: '#95ff69',
  },
];

const targetProfiles: TargetProfile[] = [
  {
    id: 'aurora',
    name: 'Aurora Entity',
    type: 'Bioform',
    status: 'Healthy',
    health: 92,
    energy: 81,
    stamina: 88,
    signal: 74,
    ghost: false,
    x: 34,
    y: 38,
    note: 'Stable biorhythm. Responsive movement pattern.',
  },
  {
    id: 'drifter',
    name: 'Hull Drifter',
    type: 'Unknown life sign',
    status: 'Damaged',
    health: 46,
    energy: 39,
    stamina: 31,
    signal: 67,
    ghost: false,
    x: 62,
    y: 47,
    note: 'Irregular cellular output. Mobility compromised.',
  },
  {
    id: 'sentinel',
    name: 'Sentinel Echo',
    type: 'Synthetic hybrid',
    status: 'Shielded',
    health: 78,
    energy: 94,
    stamina: 58,
    signal: 89,
    ghost: false,
    x: 52,
    y: 29,
    note: 'High-energy envelope detected. Scan penetration reduced.',
  },
  {
    id: 'ember',
    name: 'Ember Wisp',
    type: 'Residual life sign',
    status: 'Critical',
    health: 18,
    energy: 24,
    stamina: 12,
    signal: 41,
    ghost: false,
    x: 27,
    y: 62,
    note: 'Life signs fading. Severe instability across all channels.',
  },
  {
    id: 'vault',
    name: 'Vault Sleeper',
    type: 'Dormant specimen',
    status: 'Dormant',
    health: 0,
    energy: 73,
    stamina: 8,
    signal: 52,
    ghost: true,
    x: 73,
    y: 41,
    note: 'Body trace absent. Residual spectral charge remains coherent.',
  },
];

export function TricorderConsole() {
  const [activeMode, setActiveMode] = useState(modes[0]);
  const [activeControl, setActiveControl] = useState<ControlKind>(controlLabels[0]);
  const [activeDisplay, setActiveDisplay] = useState<DisplayKind>(modes[0].display);
  const [activeTheme, setActiveTheme] = useState<ThemeKind>('starfleet');
  const [activeTarget, setActiveTarget] = useState<TargetProfile>(targetProfiles[0]);
  const [contactView, setContactView] = useState<ContactView>('blip');
  const [materialScanId, setMaterialScanId] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setActiveDisplay(activeMode.display);
  }, [activeMode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 1300);

    return () => window.clearInterval(timer);
  }, []);

  const activeThemePreset = themePresets.find((theme) => theme.id === activeTheme) ?? themePresets[0];
  const controlProfiles: Record<ControlKind, { energy: number; spread: number; dim: number; speed: number }> = {
    Sweep: { energy: 1, spread: 1, dim: 1, speed: 1 },
    Pulse: { energy: 1.18, spread: 0.96, dim: 1, speed: 1.2 },
    Wide: { energy: 0.96, spread: 1.34, dim: 1, speed: 0.92 },
    Lock: { energy: 1.05, spread: 0.82, dim: 1, speed: 0.78 },
    Stealth: { energy: 0.74, spread: 0.68, dim: 0.62, speed: 0.72 },
  };
  const controlProfile = controlProfiles[activeControl];

  const metrics = useMemo(() => {
    const base = activeMode.id.length * 11 + tick * 7;
    return [
      Math.min(99, Math.round((40 + (base % 57)) * controlProfile.energy)),
      Math.min(99, Math.round((20 + ((base * 3) % 71)) * controlProfile.energy)),
      Math.min(99, Math.round((10 + ((base * 5) % 83)) * controlProfile.energy)),
      Math.min(99, Math.round((8 + ((base * 7) % 91)) * controlProfile.energy)),
    ];
  }, [activeMode, controlProfile.energy, tick]);

  const waveform = useMemo(
    () =>
      Array.from({ length: 24 }, (_, index) => ({
        id: `${activeMode.id}-${index}`,
        height: Math.min(
          96,
          Math.round((16 + ((tick * 13 + index * 19 + activeMode.id.length * 17) % 84)) * controlProfile.energy)
        ),
      })),
    [activeMode, controlProfile.energy, tick]
  );

  const scanRows = useMemo(
    () =>
      Array.from({ length: 5 }, (_, index) => ({
        id: `${activeMode.id}-row-${index}`,
        left: (metrics[index % metrics.length] * controlProfile.spread + index * 9) % 100,
        width: Math.max(
          14,
          Math.min(54, (18 + ((metrics[(index + 1) % metrics.length] + index * 7) % 32)) * controlProfile.spread)
        ),
      })),
    [activeMode, controlProfile.spread, metrics]
  );

  const terrainCells = useMemo(
    () =>
      Array.from({ length: 30 }, (_, index) => ({
        id: `${activeMode.id}-cell-${index}`,
        value: 18 + ((tick * 7 + index * 11 + activeMode.id.length * 13) % 82),
      })),
    [activeMode, tick]
  );

  const bioNodes = useMemo(
    () =>
      Array.from({ length: 9 }, (_, index) => ({
        id: `${activeMode.id}-node-${index}`,
        top: 16 + ((index * 19 + tick * 3) % 62),
        left: 12 + (((index * 23 + tick * 5) % 70) * Math.min(controlProfile.spread, 1.12)),
        size: Math.round((16 + ((index * 7 + tick) % 18)) * Math.max(controlProfile.energy, 0.9)),
      })),
    [activeMode, controlProfile.energy, controlProfile.spread, tick]
  );

  const materialCells = useMemo(
    () =>
      Array.from({ length: 18 }, (_, index) => ({
        id: `${activeMode.id}-material-${index}`,
        level: 22 + ((tick * 5 + index * 17 + activeMode.id.length * 9) % 74),
      })),
    [activeMode, tick]
  );

  const trackedPosition = useMemo(
    () => ({
      x: Math.max(12, Math.min(88, activeTarget.x + Math.sin(tick / 2.4 + activeTarget.x) * 5 * controlProfile.spread)),
      y: Math.max(16, Math.min(80, activeTarget.y + Math.cos(tick / 2.8 + activeTarget.y) * 4 * controlProfile.spread)),
    }),
    [activeTarget.x, activeTarget.y, controlProfile.spread, tick]
  );

  const materialReadout = useMemo(() => {
    const signatures = [
      'Titanium weave',
      'Carbon laminate',
      'Ceramic shell',
      'Duranium lattice',
      'Silicate dust',
      'Organic residue',
    ];
    return signatures.map((label, index) => ({
      label,
      value: 12 + ((materialScanId * 17 + activeTarget.signal * 3 + index * 19) % 74),
    }));
  }, [activeTarget.signal, materialScanId]);

  const statusToneClass = {
    Healthy: styles.statusHealthy,
    Damaged: styles.statusDamaged,
    Critical: styles.statusCritical,
    Dormant: styles.statusDormant,
    Shielded: styles.statusShielded,
  }[activeTarget.status];
  const showRadarBlip = activeDisplay === 'radar' && contactView !== 'hidden';
  const showBioData = activeDisplay === 'bio' && contactView === 'data';
  const showGhostTrace = activeDisplay === 'spectral' && contactView !== 'hidden' && activeTarget.ghost;
  const showTargetPanel = contactView === 'data' && (activeDisplay === 'bio' || showGhostTrace);
  const showTargetLabel = contactView === 'data';
  const showMaterialResults = activeDisplay === 'material' && materialScanId > 0;

  return (
    <div
      className={styles.viewport}
      style={{
        ['--tricorder-accent' as string]: activeMode.accent,
        ['--tricorder-shell-top' as string]: activeThemePreset.shellTop,
        ['--tricorder-shell-bottom' as string]: activeThemePreset.shellBottom,
        ['--tricorder-hull-top' as string]: activeThemePreset.hullTop,
        ['--tricorder-hull-bottom' as string]: activeThemePreset.hullBottom,
        ['--tricorder-panel-top' as string]: activeThemePreset.panelTop,
        ['--tricorder-panel-bottom' as string]: activeThemePreset.panelBottom,
        ['--tricorder-glow' as string]: activeThemePreset.glow,
        ['--tricorder-dim' as string]: String(controlProfile.dim),
      }}
    >
      <div className={styles.device}>
        <header className={styles.topBar}>
          <div>
            <div className={styles.kicker}>Starfleet Field Unit</div>
            <h1 className={styles.title}>TRICORDER</h1>
          </div>
          <div className={styles.statusCluster}>
            <span className={styles.statusDot} />
            <span className={styles.statusText}>ACTIVE</span>
          </div>
        </header>

        <section className={styles.primaryDisplay}>
          <div className={styles.displayHeader}>
            <div>
              <div className={styles.displayLabel}>Current module</div>
              <div className={styles.displayValue}>{activeMode.label}</div>
            </div>
            <div className={styles.moduleCode}>{activeMode.code}</div>
          </div>

          <div className={styles.displayTabs}>
            {displayLabels.map((display) => (
              <button
                key={display.id}
                type="button"
                className={display.id === activeDisplay ? styles.displayTabActive : styles.displayTab}
                onClick={() => setActiveDisplay(display.id)}
              >
                {display.label}
              </button>
            ))}
          </div>

          <div className={styles.scopeFrame}>
            <div className={styles.scopeAtmosphere} />
            {activeDisplay === 'radar' ? (
              <>
                <div className={styles.scopeGrid} />
                <div className={styles.scopeSweep} />
                <div className={styles.scopeCore} />
                {scanRows.map((row, index) => (
                  <div
                    key={row.id}
                    className={styles.scanBand}
                    style={{
                      left: `${row.left}%`,
                      top: `${20 + index * 15}%`,
                      width: `${row.width}%`,
                    }}
                  />
                ))}
              </>
            ) : null}

            {activeDisplay === 'bio' ? (
              <div className={styles.bioDisplay}>
                <div className={styles.bioGrid} />
                <div className={styles.bioSilhouette} />
                {bioNodes.map((node) => (
                  <span
                    key={node.id}
                    className={styles.bioNode}
                    style={{
                      top: `${node.top}%`,
                      left: `${node.left}%`,
                      width: `${node.size}px`,
                      height: `${node.size}px`,
                    }}
                  />
                ))}
                <div className={styles.bioLine} />
              </div>
            ) : null}

            {activeDisplay === 'spectral' ? (
              <div className={styles.spectralDisplay}>
                <div className={styles.spectralBackdrop} />
                <div className={styles.spectralBars}>
                  {waveform.map((bar, index) => (
                    <span
                      key={`spectral-${bar.id}`}
                      className={styles.spectralBar}
                      style={{
                        height: `${bar.height}%`,
                        animationDelay: `${index * 70}ms`,
                      }}
                    />
                  ))}
                </div>
                <div className={styles.spectralCurve} />
              </div>
            ) : null}

            {activeDisplay === 'terrain' ? (
              <div className={styles.terrainDisplay}>
                <div className={styles.terrainGrid}>
                  {terrainCells.map((cell) => (
                    <span
                      key={cell.id}
                      className={styles.terrainCell}
                      style={{ opacity: cell.value / 100 }}
                    />
                  ))}
                </div>
                <div className={styles.terrainHorizon} />
                <div className={styles.terrainPing} />
              </div>
            ) : null}

            {activeDisplay === 'material' ? (
              <div className={styles.materialDisplay}>
                <div className={styles.materialBackdrop} />
                <div className={styles.materialColumnGrid}>
                  {materialCells.map((cell, index) => (
                    <span
                      key={cell.id}
                      className={styles.materialColumn}
                      style={{
                        height: `${cell.level}%`,
                        animationDelay: `${index * 140}ms`,
                      }}
                    />
                  ))}
                </div>
                <div className={styles.materialHexGrid}>
                  {materialCells.slice(0, 12).map((cell) => (
                    <span
                      key={`${cell.id}-hex`}
                      className={styles.materialHex}
                      style={{ opacity: cell.level / 100 }}
                    />
                  ))}
                </div>
                <div className={styles.materialBeam} />
              </div>
            ) : null}

            {showRadarBlip ? (
              <div
                className={activeControl === 'Lock' ? styles.targetMarkerLocked : styles.targetMarker}
                style={{
                  left: `${trackedPosition.x}%`,
                  top: `${trackedPosition.y}%`,
                }}
              >
                <span className={styles.targetMarkerCore} />
                {showTargetLabel ? (
                  <div className={styles.targetLabel}>
                    <strong>{activeTarget.name}</strong>
                    <span>{activeTarget.status}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {showBioData ? (
              <div className={styles.bioVitals}>
                <div className={styles.bioVitalsHeader}>
                  <span>{activeTarget.name}</span>
                  <span>{activeTarget.status}</span>
                </div>
                <div className={styles.bioVitalsGrid}>
                  <span>Health {activeTarget.health}%</span>
                  <span>Energy {activeTarget.energy}%</span>
                  <span>Stamina {activeTarget.stamina}%</span>
                </div>
              </div>
            ) : null}

            {showGhostTrace ? (
              <div className={styles.ghostTrace}>
                <div className={styles.ghostTraceLabel}>
                  {activeTarget.name} / spectral residue
                </div>
              </div>
            ) : null}

            {showMaterialResults ? (
              <div className={styles.materialResults}>
                {materialReadout.slice(0, 3).map((result) => (
                  <div key={result.label} className={styles.materialResultRow}>
                    <span>{result.label}</span>
                    <strong>{result.value}%</strong>
                  </div>
                ))}
              </div>
            ) : null}

            {activeControl === 'Pulse' ? <div className={styles.pulseOverlay} /> : null}
            {activeControl === 'Wide' ? <div className={styles.wideOverlay} /> : null}
            {activeControl === 'Lock' ? <div className={styles.lockOverlay} /> : null}
            {activeControl === 'Stealth' ? <div className={styles.stealthOverlay} /> : null}

            <div className={styles.scopeReadout}>
              <div>{activeMode.summary}</div>
              <div className={styles.subtle}>
                {activeControl} channel / {activeDisplay} view / cycle {String(tick % 99).padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className={styles.metrics}>
            {activeMode.readouts.map((label, index) => (
              <div key={label} className={styles.metricCard}>
                <div className={styles.metricLabel}>{label}</div>
                <div className={styles.metricValue}>{metrics[index]}%</div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.hybridPanel}>
          <div className={styles.hybridHeader}>
            <div className={styles.panelTitle}>Signal telemetry</div>
            <div className={styles.subtle}>
              {activeThemePreset.label} theme / {contactView}
            </div>
          </div>

          <div className={styles.waveformCompact}>
            {waveform.map((bar, index) => (
              <span
                key={bar.id}
                className={styles.waveBar}
                style={{
                  height: `${bar.height}%`,
                  animationDelay: `${index * 80}ms`,
                }}
              />
            ))}
          </div>

          <div className={styles.telemetryGridCompact}>
            <Readout label="Focus" value={activeControl} />
            <Readout label="Harmonic" value={`${metrics[3]}.4`} />
            <Readout label="Stability" value={`${100 - metrics[1]}%`} />
            <Readout label="Phase" value={activeMode.code} />
          </div>

          <p className={styles.detailText}>{activeMode.detail}</p>
        </section>

        {showTargetPanel ? (
        <section className={styles.targetPanel}>
          <div className={styles.hybridHeader}>
            <div className={styles.panelTitle}>Life signs</div>
            <div className={`${styles.targetStatusBadge} ${statusToneClass}`}>{activeTarget.status}</div>
          </div>

          <div className={styles.targetIdentity}>
            <div>
              <div className={styles.targetName}>{activeTarget.name}</div>
              <div className={styles.targetMeta}>
                {activeTarget.type} / Signal {activeTarget.signal}%
              </div>
            </div>
            <div className={styles.moduleCode}>Target locked</div>
          </div>

          <div className={styles.lifeStats}>
            <LifeStat label="Health" value={activeTarget.health} />
            <LifeStat label="Energy" value={activeTarget.energy} />
            <LifeStat label="Stamina" value={activeTarget.stamina} />
          </div>

          <p className={styles.detailText}>{activeTarget.note}</p>

          <div className={styles.targetSelector}>
            {targetProfiles.map((target) => (
              <button
                key={target.id}
                type="button"
                className={target.id === activeTarget.id ? styles.targetButtonActive : styles.targetButton}
                onClick={() => setActiveTarget(target)}
              >
                <span>{target.name}</span>
                <small>{target.status}</small>
              </button>
            ))}
          </div>
        </section>
        ) : null}

        <section className={styles.controls}>
          <div className={styles.panelTitle}>Contact layer</div>
          <div className={styles.contactViewStrip}>
            {(['hidden', 'blip', 'data'] as ContactView[]).map((view) => (
              <button
                key={view}
                type="button"
                className={view === contactView ? styles.pillActive : styles.pill}
                onClick={() => setContactView(view)}
              >
                {view}
              </button>
            ))}
          </div>
          <div className={styles.targetSelectorCompact}>
            {targetProfiles.map((target) => (
              <button
                key={target.id}
                type="button"
                className={target.id === activeTarget.id ? styles.targetChipActive : styles.targetChip}
                onClick={() => setActiveTarget(target)}
              >
                {target.name}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.controls}>
          <div className={styles.panelTitle}>Scan modules</div>
          <div className={styles.buttonGrid}>
            {modes.map((mode) => {
              const active = mode.id === activeMode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  className={active ? styles.moduleButtonActive : styles.moduleButton}
                  onClick={() => setActiveMode(mode)}
                >
                  <span>{mode.label}</span>
                  <small>{mode.code}</small>
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.controls}>
          <div className={styles.panelTitle}>Theme bank</div>
          <div className={styles.themeStrip}>
            {themePresets.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={theme.id === activeTheme ? styles.themeButtonActive : styles.themeButton}
                onClick={() => setActiveTheme(theme.id)}
                style={{
                  ['--theme-swatch-a' as string]: theme.shellTop,
                  ['--theme-swatch-b' as string]: theme.glow,
                }}
              >
                <span className={styles.themeSwatch} />
                <span>{theme.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.controls}>
          <div className={styles.panelTitle}>Control bank</div>
          <div className={styles.controlStrip}>
            {controlLabels.map((label) => (
              <button
                key={label}
                type="button"
                className={label === activeControl ? styles.pillActive : styles.pill}
                onClick={() => setActiveControl(label)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {activeDisplay === 'material' ? (
          <section className={styles.controls}>
            <div className={styles.panelTitle}>Material trigger</div>
            <button
              type="button"
              className={styles.materialTrigger}
              onClick={() => setMaterialScanId((value) => value + 1)}
            >
              Trigger focused material scan
            </button>
          </section>
        ) : null}

        <Link className={styles.hiddenBack} href="/">
          return to dashboard
        </Link>
      </div>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.readout}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.readoutValue}>{value}</div>
    </div>
  );
}

function LifeStat({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.lifeStat}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.lifeBarTrack}>
        <span className={styles.lifeBarFill} style={{ width: `${value}%` }} />
      </div>
      <div className={styles.readoutValue}>{value}%</div>
    </div>
  );
}
