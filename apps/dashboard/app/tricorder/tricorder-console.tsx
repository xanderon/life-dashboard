'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from './tricorder.module.css';

type Mode = 'life' | 'environment' | 'signal';
type Phase = 'standby' | 'scanning' | 'complete';

const modes: Record<Mode, { label: string; code: string; title: string; result: string; readings: [string, string][] }> = {
  life: { label: 'LIFE', code: 'BIO / 01', title: 'LIFE SIGNS', result: 'Organic signature detected', readings: [['SIGNATURE', 'ORGANIC'], ['PATTERN', 'STABLE'], ['CONFIDENCE', '94.2%']] },
  environment: { label: 'ENV', code: 'ENV / 02', title: 'ENVIRONMENT', result: 'Atmosphere within parameters', readings: [['ATMOSPHERE', 'CLASS M'], ['PRESSURE', '101.3 kPa'], ['TEMPERATURE', '21.4 °C']] },
  signal: { label: 'SIGNAL', code: 'SIG / 03', title: 'SIGNAL TRACE', result: 'Carrier signature detected', readings: [['FREQUENCY', '2.41 GHz'], ['STRENGTH', '−48 dB'], ['PATTERN', 'NARROW']] },
};

export function TricorderConsole() {
  const [mode, setMode] = useState<Mode>('life');
  const [phase, setPhase] = useState<Phase>('standby');
  const [sweep, setSweep] = useState(0);
  const current = modes[mode];

  useEffect(() => {
    if (phase !== 'scanning') return;
    const timer = window.setTimeout(() => setPhase('complete'), 3200);
    return () => window.clearTimeout(timer);
  }, [phase, sweep]);

  function selectMode(next: Mode) {
    setMode(next);
    setPhase('standby');
  }

  function scan() {
    setSweep(value => value + 1);
    setPhase('scanning');
  }

  return (
    <div className={styles.stage}>
      <div className={styles.device}>
        <header className={styles.top}>
          <Link href="/" className={styles.back} aria-label="Înapoi la dashboard">‹</Link>
          <div className={styles.brand}><span>STARFLEET SCIENCE DIVISION</span><strong>TRICORDER <i>MK VII</i></strong></div>
          <div className={styles.power}><span /><small>PWR</small></div>
        </header>

        <div className={styles.hardware}>
          <div className={styles.vent} aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
          <div className={styles.hullLabel}><span>TR-590</span><span>FIELD INSTRUMENT</span></div>

          <section className={styles.screen} aria-label="Scanner simulation">
            <div className={styles.screenTop}><span>▰ &nbsp; {current.code}</span><span>SIMULATION <b>●</b></span></div>
            <div className={styles.screenTitle}><div><small>ACTIVE SENSOR</small><h1>{current.title}</h1></div><span className={styles.channel}>CH. 0{Object.keys(modes).indexOf(mode) + 1}</span></div>
            <div className={`${styles.scope} ${phase === 'scanning' ? styles.scopeScanning : ''}`} aria-hidden="true">
              <div className={styles.grid} /><div className={styles.ring1} /><div className={styles.ring2} /><div className={styles.ring3} />
              <div className={styles.crosshair} /><div className={styles.sweep} /><div className={styles.center} />
              {phase === 'complete' && <><span className={styles.contact} /><span className={styles.contactLabel}>CONTACT 01</span></>}
              <div className={styles.scopeLeft}>RANGE<br/><b>025</b><br/>METERS</div><div className={styles.scopeRight}>AZ<br/><b>084°</b><br/>ELEV 00°</div>
              <div className={styles.scopeBottom}><span>SECTOR 04</span><span>∷ ∷ ∷ ∷ ∷</span></div>
            </div>
            <div className={styles.readout} aria-live="polite"><span className={styles.readoutDot} /><span>{phase === 'standby' ? 'READY FOR SCAN' : phase === 'scanning' ? 'SCANNING SECTOR…' : current.result}</span><small>{phase === 'complete' ? 'COMPLETE' : phase === 'scanning' ? 'ACTIVE' : 'STANDBY'}</small></div>
            <div className={styles.readings}>{current.readings.map(([label,value]) => <div key={label}><span>{label}</span><strong>{phase === 'complete' ? value : '— —'}</strong></div>)}</div>
          </section>

          <div className={styles.deckHead}><span>SENSOR ARRAY</span><span>SELECT MODE</span></div>
          <div className={styles.modeRow} role="group" aria-label="Select scan mode">{(Object.keys(modes) as Mode[]).map((key, index) => <button key={key} type="button" onClick={() => selectMode(key)} aria-pressed={mode === key} className={`${styles.modeButton} ${mode === key ? styles.selected : ''}`}><small>0{index + 1}</small><span>{modes[key].label}</span><i /></button>)}</div>
          <div className={styles.bottomDeck}>
            <div className={styles.signalBars} aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>
            <button type="button" className={styles.scanButton} onClick={scan}><span className={styles.scanIcon}>✳</span>{phase === 'scanning' ? 'RESTART SCAN' : phase === 'complete' ? 'SCAN AGAIN' : 'INITIATE SCAN'}</button>
            <div className={styles.deckNumber}>24<span>●</span>07</div>
          </div>
          <div className={styles.foot}><span>STARFLEET PROPERTY · 2369</span><span>SIMULATED READINGS</span></div>
        </div>
      </div>
    </div>
  );
}
