'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import styles from './tricorder.module.css';

type Mode = {
  id: string;
  label: string;
  code: string;
  accent: string;
  summary: string;
  detail: string;
  readouts: [string, string, string];
};

const modes: Mode[] = [
  {
    id: 'bio',
    label: 'Bio Scan',
    code: 'MED-01',
    accent: '#ffd36b',
    summary: 'Semnaturi organice, ritm si micro-variatii.',
    detail: 'Mapare ritmica a semnalelor vii cu focus pe puls si densitate celulara.',
    readouts: ['Pulse sync', 'Neural shimmer', 'Cell mesh'],
  },
  {
    id: 'env',
    label: 'Env Sweep',
    code: 'ATM-09',
    accent: '#69f0d1',
    summary: 'Compozitie aer, presiune si zone cu turbulenta.',
    detail: 'Senzorii urmaresc deviatii termice, compusi volatili si instabilitati de camp.',
    readouts: ['Air mix', 'Pressure span', 'Thermal drift'],
  },
  {
    id: 'signal',
    label: 'Signal Trace',
    code: 'SIG-77',
    accent: '#7fb6ff',
    summary: 'Urme radio, bruiaj si purtatoare slabe.',
    detail: 'Filtrare pe benzi inguste pentru detectie de ecouri si surse ascunse.',
    readouts: ['Carrier lock', 'Noise gate', 'Echo depth'],
  },
  {
    id: 'spectral',
    label: 'Spectral',
    code: 'SPC-42',
    accent: '#ff8bc8',
    summary: 'Spectru de energie si anomalii luminoase.',
    detail: 'Separa emisii scurte de fond si scoate in fata impulsurile rare.',
    readouts: ['Flux prism', 'Gamma lace', 'Phase split'],
  },
  {
    id: 'terrain',
    label: 'Terrain',
    code: 'GEO-18',
    accent: '#ff9f6d',
    summary: 'Textura, cavitati si contur local.',
    detail: 'Reconstructie rapida a suprafetei pentru goluri, muchii si corpuri dense.',
    readouts: ['Depth map', 'Mass edge', 'Void ping'],
  },
  {
    id: 'stellar',
    label: 'Stellar',
    code: 'AST-12',
    accent: '#bb98ff',
    summary: 'Campuri, orientare si pattern orbital.',
    detail: 'Modeleaza vectori de camp si deriva pentru navigatie imaginara de punte.',
    readouts: ['Field braid', 'Orbit skew', 'Vector calm'],
  },
];

const controlLabels = ['Sweep', 'Pulse', 'Wide', 'Lock', 'Stealth'];

export function TricorderConsole() {
  const [activeMode, setActiveMode] = useState(modes[0]);
  const [activeControl, setActiveControl] = useState(controlLabels[0]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 900);

    return () => window.clearInterval(timer);
  }, []);

  const metrics = useMemo(() => {
    const base = activeMode.id.length * 11 + tick * 7;
    return [
      40 + (base % 57),
      20 + ((base * 3) % 71),
      10 + ((base * 5) % 83),
      8 + ((base * 7) % 91),
    ];
  }, [activeMode, tick]);

  const waveform = useMemo(
    () =>
      Array.from({ length: 24 }, (_, index) => ({
        id: `${activeMode.id}-${index}`,
        height: 16 + ((tick * 13 + index * 19 + activeMode.id.length * 17) % 84),
      })),
    [activeMode, tick]
  );

  const scanRows = useMemo(
    () =>
      Array.from({ length: 5 }, (_, index) => ({
        id: `${activeMode.id}-row-${index}`,
        left: (metrics[index % metrics.length] + index * 9) % 100,
        width: 18 + ((metrics[(index + 1) % metrics.length] + index * 7) % 32),
      })),
    [activeMode, metrics]
  );

  return (
    <div className={styles.viewport} style={{ ['--tricorder-accent' as string]: activeMode.accent }}>
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

          <div className={styles.scopeFrame}>
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
            <div className={styles.scopeReadout}>
              <div>{activeMode.summary}</div>
              <div className={styles.subtle}>
                {activeControl} channel / cycle {String(tick % 99).padStart(2, '0')}
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

        <section className={styles.panelStack}>
          <div className={styles.wavePanel}>
            <div className={styles.panelTitle}>Live feed</div>
            <div className={styles.waveform}>
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
          </div>

          <div className={styles.telemetryPanel}>
            <div className={styles.panelTitle}>Telemetry</div>
            <div className={styles.telemetryGrid}>
              <Readout label="Focus" value={activeControl} />
              <Readout label="Harmonic" value={`${metrics[3]}.4`} />
              <Readout label="Stability" value={`${100 - metrics[1]}%`} />
              <Readout label="Phase" value={activeMode.code} />
            </div>
            <p className={styles.detailText}>{activeMode.detail}</p>
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
