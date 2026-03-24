'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import styles from './tricorder.module.css';

type DisplayKind = 'radar' | 'bio' | 'spectral' | 'terrain' | 'material';
type ThemeKind = 'starfleet' | 'nebula' | 'red-alert' | 'emerald';
type ControlKind = 'Sweep' | 'Pulse' | 'Wide' | 'Lock' | 'Stealth';
type ContactView = 'hidden' | 'blip' | 'data';
type TargetStatus = 'Healthy' | 'Damaged' | 'Critical' | 'Dormant' | 'Shielded';

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

const modes: Mode[] = [
  {
    id: 'bio',
    label: 'Bio Scan',
    code: 'MED-01',
    accent: '#ffd36b',
    display: 'bio',
    summary: 'Organic signatures, pulse rhythm, and tissue variance.',
    detail: 'Use this when you want actual life signs and a focused specimen read.',
    readouts: ['Pulse Sync', 'Neural Mesh', 'Cell Density'],
  },
  {
    id: 'env',
    label: 'Env Sweep',
    code: 'ATM-09',
    accent: '#69f0d1',
    display: 'radar',
    summary: 'Atmospheric drift, motion traces, and moving contacts.',
    detail: 'Good general-purpose tracking mode when you want the screen to feel alive.',
    readouts: ['Air Mix', 'Pressure', 'Thermal Drift'],
  },
  {
    id: 'signal',
    label: 'Signal Trace',
    code: 'SIG-77',
    accent: '#7fb6ff',
    display: 'spectral',
    summary: 'Signal carriers, masked traces, and phase noise.',
    detail: 'Best for subtle anomalies, radio traces, and interference patterns.',
    readouts: ['Carrier Lock', 'Noise Gate', 'Echo Depth'],
  },
  {
    id: 'spectral',
    label: 'Spectral',
    code: 'SPC-42',
    accent: '#ff8bc8',
    display: 'spectral',
    summary: 'Energy bloom, ghost residue, and unstable signatures.',
    detail: 'A ghost-friendly view. If a target is phased, this display reveals it.',
    readouts: ['Flux Prism', 'Phase Split', 'Spectral Rise'],
  },
  {
    id: 'terrain',
    label: 'Terrain',
    code: 'GEO-18',
    accent: '#ff9f6d',
    display: 'terrain',
    summary: 'Surface contour, void pockets, and dense edges.',
    detail: 'Clean mapping mode. This one should feel readable, not overloaded.',
    readouts: ['Depth Map', 'Mass Edge', 'Void Ping'],
  },
  {
    id: 'material',
    label: 'Material Scan',
    code: 'MAT-31',
    accent: '#8cf07d',
    display: 'material',
    summary: 'Focused material lattice scan with triggered composition pass.',
    detail: 'Trigger a scan to resolve what the object is made of.',
    readouts: ['Lattice', 'Density', 'Composite'],
  },
  {
    id: 'stellar',
    label: 'Stellar',
    code: 'AST-12',
    accent: '#bb98ff',
    display: 'radar',
    summary: 'Vector drift and orbital tracking.',
    detail: 'Another radar-forward mode, but more navigation flavored.',
    readouts: ['Field Braid', 'Orbit Skew', 'Vector Calm'],
  },
];

const themes: ThemePreset[] = [
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

const targets: TargetProfile[] = [
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
    note: 'Stable biorhythm. Fast response and balanced motion.',
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
    note: 'Irregular read. Mobility is present but compromised.',
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
    id: 'vault',
    name: 'Vault Sleeper',
    type: 'Phased specimen',
    status: 'Dormant',
    health: 0,
    energy: 73,
    stamina: 8,
    signal: 52,
    ghost: true,
    x: 73,
    y: 41,
    note: 'No physical vitality, but spectral charge remains coherent.',
  },
];

const controls: ControlKind[] = ['Sweep', 'Pulse', 'Wide', 'Lock', 'Stealth'];
const contactViews: ContactView[] = ['hidden', 'blip', 'data'];

export function TricorderConsole() {
  const [activeMode, setActiveMode] = useState<Mode>(modes[0]);
  const [activeDisplay, setActiveDisplay] = useState<DisplayKind>(modes[0].display);
  const [activeTheme, setActiveTheme] = useState<ThemeKind>('starfleet');
  const [activeControl, setActiveControl] = useState<ControlKind>('Sweep');
  const [contactView, setContactView] = useState<ContactView>('blip');
  const [activeTarget, setActiveTarget] = useState<TargetProfile>(targets[0]);
  const [materialPass, setMaterialPass] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setActiveDisplay(activeMode.display);
  }, [activeMode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 1200);
    return () => window.clearInterval(timer);
  }, []);

  const theme = themes.find((entry) => entry.id === activeTheme) ?? themes[0];
  const controlMap: Record<ControlKind, { energy: number; spread: number; dim: number }> = {
    Sweep: { energy: 1, spread: 1, dim: 1 },
    Pulse: { energy: 1.18, spread: 0.92, dim: 1 },
    Wide: { energy: 0.95, spread: 1.28, dim: 1 },
    Lock: { energy: 1.04, spread: 0.82, dim: 1 },
    Stealth: { energy: 0.72, spread: 0.66, dim: 0.7 },
  };
  const control = controlMap[activeControl];

  const metrics = useMemo(() => {
    const base = activeMode.id.length * 13 + tick * 9;
    return [
      Math.min(99, Math.round((36 + (base % 61)) * control.energy)),
      Math.min(99, Math.round((24 + ((base * 3) % 63)) * control.energy)),
      Math.min(99, Math.round((18 + ((base * 5) % 67)) * control.energy)),
    ];
  }, [activeMode.id, control.energy, tick]);

  const waveform = useMemo(
    () =>
      Array.from({ length: 20 }, (_, index) => ({
        id: `${activeMode.id}-${index}`,
        height: Math.min(94, Math.round((22 + ((tick * 11 + index * 17 + activeMode.id.length * 7) % 74)) * control.energy)),
      })),
    [activeMode.id, control.energy, tick]
  );

  const tracked = useMemo(
    () => ({
      x: Math.max(12, Math.min(88, activeTarget.x + Math.sin(tick / 2.6 + activeTarget.x) * 5 * control.spread)),
      y: Math.max(14, Math.min(82, activeTarget.y + Math.cos(tick / 3 + activeTarget.y) * 4 * control.spread)),
    }),
    [activeTarget.x, activeTarget.y, control.spread, tick]
  );

  const terrainCells = useMemo(
    () =>
      Array.from({ length: 30 }, (_, index) => ({
        id: `${activeMode.id}-terrain-${index}`,
        value: 18 + ((tick * 7 + index * 13 + activeMode.id.length * 5) % 80),
      })),
    [activeMode.id, tick]
  );

  const bioNodes = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => ({
        id: `${activeMode.id}-bio-${index}`,
        top: 18 + ((index * 17 + tick * 3) % 58),
        left: 18 + ((index * 21 + tick * 4) % 52),
        size: 14 + ((index * 7 + tick) % 16),
      })),
    [activeMode.id, tick]
  );

  const materialBars = useMemo(
    () =>
      Array.from({ length: 16 }, (_, index) => ({
        id: `${activeMode.id}-mat-${index}`,
        level: 20 + ((materialPass * 19 + activeTarget.signal * 2 + index * 11) % 78),
      })),
    [activeMode.id, activeTarget.signal, materialPass]
  );

  const materialResults = useMemo(() => {
    const labels = ['Titanium weave', 'Carbon laminate', 'Ceramic shell', 'Organic trace'];
    return labels.map((label, index) => ({
      label,
      value: 18 + ((materialPass * 17 + activeTarget.signal * 3 + index * 21) % 74),
    }));
  }, [activeTarget.signal, materialPass]);

  const showBlip = activeDisplay === 'radar' && contactView !== 'hidden';
  const showBioData = activeDisplay === 'bio' && contactView === 'data';
  const showGhost = activeDisplay === 'spectral' && activeTarget.ghost && contactView !== 'hidden';
  const showMaterialData = activeDisplay === 'material' && materialPass > 0;
  const showContactCard = contactView === 'data' && (activeDisplay === 'bio' || showGhost);

  const statusClass = {
    Healthy: styles.statusHealthy,
    Damaged: styles.statusDamaged,
    Critical: styles.statusCritical,
    Dormant: styles.statusDormant,
    Shielded: styles.statusShielded,
  }[activeTarget.status];

  return (
    <div
      className={styles.viewport}
      style={{
        ['--tricorder-accent' as string]: activeMode.accent,
        ['--tricorder-shell-top' as string]: theme.shellTop,
        ['--tricorder-shell-bottom' as string]: theme.shellBottom,
        ['--tricorder-hull-top' as string]: theme.hullTop,
        ['--tricorder-hull-bottom' as string]: theme.hullBottom,
        ['--tricorder-panel-top' as string]: theme.panelTop,
        ['--tricorder-panel-bottom' as string]: theme.panelBottom,
        ['--tricorder-glow' as string]: theme.glow,
        ['--tricorder-dim' as string]: String(control.dim),
      }}
    >
      <div className={styles.device}>
        <header className={styles.topBar}>
          <div>
            <div className={styles.kicker}>Field Science Unit</div>
            <h1 className={styles.title}>TRICORDER</h1>
          </div>
          <div className={styles.statusCluster}>
            <span className={styles.statusDot} />
            <span className={styles.statusText}>{activeControl}</span>
          </div>
        </header>

        <section className={styles.primaryDisplay}>
          <div className={styles.displayHeader}>
            <div>
              <div className={styles.displayLabel}>Active Mode</div>
              <div className={styles.displayValue}>{activeMode.label}</div>
            </div>
            <div className={styles.moduleCode}>{activeMode.code}</div>
          </div>

          <div className={styles.scopeFrame}>
            <div className={styles.scopeAtmosphere} />

            {activeDisplay === 'radar' ? (
              <div className={styles.radarLayer}>
                <div className={styles.scopeGrid} />
                <div className={styles.scopeSweep} />
                <div className={styles.scopeCore} />
                {showBlip ? (
                  <div
                    className={activeControl === 'Lock' ? styles.targetMarkerLocked : styles.targetMarker}
                    style={{ left: `${tracked.x}%`, top: `${tracked.y}%` }}
                  >
                    <span className={styles.targetMarkerCore} />
                    {contactView === 'data' ? (
                      <div className={styles.targetLabel}>
                        <strong>{activeTarget.name}</strong>
                        <span>{activeTarget.status}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeDisplay === 'bio' ? (
              <div className={styles.bioLayer}>
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
              </div>
            ) : null}

            {activeDisplay === 'spectral' ? (
              <div className={styles.spectralLayer}>
                <div className={styles.spectralBackdrop} />
                <div className={styles.spectralBars}>
                  {waveform.map((bar, index) => (
                    <span
                      key={bar.id}
                      className={styles.spectralBar}
                      style={{ height: `${bar.height}%`, animationDelay: `${index * 70}ms` }}
                    />
                  ))}
                </div>
                <div className={styles.spectralCurve} />
                {showGhost ? (
                  <div className={styles.ghostTrace}>
                    <div className={styles.ghostTraceLabel}>{activeTarget.name} / ghost residue</div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeDisplay === 'terrain' ? (
              <div className={styles.terrainLayer}>
                <div className={styles.terrainGrid}>
                  {terrainCells.map((cell) => (
                    <span key={cell.id} className={styles.terrainCell} style={{ opacity: cell.value / 100 }} />
                  ))}
                </div>
                <div className={styles.terrainHorizon} />
                <div className={styles.terrainPing} />
              </div>
            ) : null}

            {activeDisplay === 'material' ? (
              <div className={styles.materialLayer}>
                <div className={styles.materialBackdrop} />
                <div className={styles.materialColumnGrid}>
                  {materialBars.map((bar, index) => (
                    <span
                      key={bar.id}
                      className={styles.materialColumn}
                      style={{ height: `${bar.level}%`, animationDelay: `${index * 110}ms` }}
                    />
                  ))}
                </div>
                <div className={styles.materialBeam} />
                {showMaterialData ? (
                  <div className={styles.materialResults}>
                    {materialResults.map((result) => (
                      <div key={result.label} className={styles.materialResultRow}>
                        <span>{result.label}</span>
                        <strong>{result.value}%</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeControl === 'Pulse' ? <div className={styles.pulseOverlay} /> : null}
            {activeControl === 'Wide' ? <div className={styles.wideOverlay} /> : null}
            {activeControl === 'Lock' ? <div className={styles.lockOverlay} /> : null}
            {activeControl === 'Stealth' ? <div className={styles.stealthOverlay} /> : null}

            <div className={styles.scopeReadout}>
              <div>{activeMode.summary}</div>
              <div className={styles.subtle}>
                {activeDisplay} / {contactView} / cycle {String(tick % 99).padStart(2, '0')}
              </div>
            </div>
          </div>

          <div className={styles.infoStrip}>
            <InfoCell label={activeMode.readouts[0]} value={`${metrics[0]}%`} />
            <InfoCell label={activeMode.readouts[1]} value={`${metrics[1]}%`} />
            <InfoCell label={activeMode.readouts[2]} value={`${metrics[2]}%`} />
            <InfoCell label="Theme" value={theme.label} />
          </div>

          {showContactCard ? (
            <div className={styles.contactCard}>
              <div className={styles.contactCardHeader}>
                <div>
                  <div className={styles.targetName}>{activeTarget.name}</div>
                  <div className={styles.targetMeta}>{activeTarget.type}</div>
                </div>
                <div className={`${styles.targetStatusBadge} ${statusClass}`}>{activeTarget.status}</div>
              </div>
              <div className={styles.lifeStats}>
                <LifeStat label="Health" value={activeTarget.health} />
                <LifeStat label="Energy" value={activeTarget.energy} />
                <LifeStat label="Stamina" value={activeTarget.stamina} />
              </div>
              <p className={styles.detailText}>{activeTarget.note}</p>
            </div>
          ) : null}
        </section>

        <section className={styles.deck}>
          <div className={styles.panelTitle}>Mode Deck</div>
          <div className={styles.buttonGrid}>
            {modes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={mode.id === activeMode.id ? styles.moduleButtonActive : styles.moduleButton}
                onClick={() => setActiveMode(mode)}
              >
                <span>{mode.label}</span>
                <small>{mode.code}</small>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.deck}>
          <div className={styles.panelTitle}>Contact Deck</div>
          <div className={styles.contactViewStrip}>
            {contactViews.map((view) => (
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
            {targets.map((target) => (
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

        <section className={styles.deck}>
          <div className={styles.panelTitle}>Theme Deck</div>
          <div className={styles.themeStrip}>
            {themes.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={entry.id === activeTheme ? styles.themeButtonActive : styles.themeButton}
                onClick={() => setActiveTheme(entry.id)}
                style={{
                  ['--theme-swatch-a' as string]: entry.shellTop,
                  ['--theme-swatch-b' as string]: entry.glow,
                }}
              >
                <span className={styles.themeSwatch} />
                <span>{entry.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.deck}>
          <div className={styles.panelTitle}>Control Bank</div>
          <div className={styles.controlStrip}>
            {controls.map((entry) => (
              <button
                key={entry}
                type="button"
                className={entry === activeControl ? styles.pillActive : styles.pill}
                onClick={() => setActiveControl(entry)}
              >
                {entry}
              </button>
            ))}
          </div>
          {activeDisplay === 'material' ? (
            <button
              type="button"
              className={styles.materialTrigger}
              onClick={() => setMaterialPass((value) => value + 1)}
            >
              Trigger focused material scan
            </button>
          ) : null}
        </section>

        <Link className={styles.hiddenBack} href="/">
          return to dashboard
        </Link>
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoCell}>
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
