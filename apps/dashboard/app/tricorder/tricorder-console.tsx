'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from './tricorder.module.css';

type Mode = 'life' | 'environment' | 'signal';
type Phase = 'standby' | 'scanning' | 'complete';
type Finding = { name: string; message: string; readings: [string, string][] };

const modes: Record<Mode, { label: string; code: string; title: string; findings: Finding[] }> = {
  life: { label: 'LIFE', code: 'BIO / 01', title: 'LIFE SIGNS', findings: [
    { name: 'CONTACT 01', message: 'Organic lifeform detected', readings: [['SIGNATURE', 'ORGANIC'], ['PATTERN', 'STABLE'], ['CONFIDENCE', '94.2%']] },
    { name: 'CONTACT 02', message: 'Unknown lifeform detected', readings: [['SIGNATURE', 'UNKNOWN'], ['PATTERN', 'ACTIVE'], ['CONFIDENCE', '87.6%']] },
    { name: 'CONTACT 03', message: 'Microbial colony detected', readings: [['SIGNATURE', 'MICROBIAL'], ['PATTERN', 'STABLE'], ['CONFIDENCE', '91.8%']] },
  ] },
  environment: { label: 'ENV', code: 'ENV / 02', title: 'ENVIRONMENT', findings: [
    { name: 'SECTOR 01', message: 'Atmosphere within parameters', readings: [['ATMOSPHERE', 'CLASS M'], ['PRESSURE', '101.3 kPa'], ['TEMPERATURE', '21.4 °C']] },
    { name: 'SECTOR 02', message: 'Temperature variation detected', readings: [['ATMOSPHERE', 'CLASS M'], ['PRESSURE', '99.8 kPa'], ['TEMPERATURE', '16.8 °C']] },
    { name: 'SECTOR 03', message: 'Trace elements detected', readings: [['ATMOSPHERE', 'CLASS M'], ['PRESSURE', '102.1 kPa'], ['TEMPERATURE', '24.2 °C']] },
  ] },
  signal: { label: 'SIGNAL', code: 'SIG / 03', title: 'SIGNAL TRACE', findings: [
    { name: 'SIGNAL 01', message: 'Carrier signature detected', readings: [['FREQUENCY', '2.41 GHz'], ['STRENGTH', '−48 dB'], ['PATTERN', 'NARROW']] },
    { name: 'SIGNAL 02', message: 'Unidentified transmission', readings: [['FREQUENCY', '1.62 GHz'], ['STRENGTH', '−62 dB'], ['PATTERN', 'PULSED']] },
    { name: 'SIGNAL 03', message: 'Subspace interference detected', readings: [['FREQUENCY', '4.08 GHz'], ['STRENGTH', '−39 dB'], ['PATTERN', 'VARIABLE']] },
  ] },
};
const positions = [{ x: 32, y: 34 }, { x: 68, y: 39 }, { x: 55, y: 69 }];

function feedback(enabled: boolean, frequency = 620) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(12);
  if (!enabled) return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.045, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.onended = () => { void context.close(); };
    oscillator.start(); oscillator.stop(context.currentTime + 0.12);
  } catch { /* Audio is optional, including when unavailable in the browser. */ }
}

export function TricorderConsole() {
  const [mode, setMode] = useState<Mode>('life');
  const [phase, setPhase] = useState<Phase>('standby');
  const [sweep, setSweep] = useState(0);
  const [selectedContact, setSelectedContact] = useState(0);
  const [sound, setSound] = useState(false);
  const current = modes[mode];
  const finding = current.findings[(selectedContact + Math.max(0, sweep - 1)) % current.findings.length];

  useEffect(() => {
    if (phase !== 'scanning') return;
    const timer = window.setTimeout(() => setPhase('complete'), 2800);
    return () => window.clearTimeout(timer);
  }, [phase, sweep]);

  function selectMode(next: Mode) {
    feedback(sound, 540);
    setMode(next); setPhase('standby'); setSelectedContact(0);
  }
  function scan() {
    feedback(sound, 740);
    setSelectedContact(0); setSweep(value => value + 1); setPhase('scanning');
  }
  function selectContact(index: number) {
    feedback(sound, 850);
    setSelectedContact(index);
  }

  return (
    <div className={styles.stage}>
      <div className={styles.device}>
        <header className={styles.top}>
          <Link href="/" className={styles.back} aria-label="Înapoi la dashboard">‹</Link>
          <div className={styles.brand}><span>STARFLEET SCIENCE DIVISION</span><strong>TRICORDER <i>MK VII</i></strong></div>
          <button type="button" className={styles.soundButton} aria-label={sound ? 'Dezactivează sunetul' : 'Activează sunetul'} aria-pressed={sound} onClick={() => { feedback(!sound, 660); setSound(!sound); }}>♪ <small>{sound ? 'ON' : 'OFF'}</small></button>
        </header>

        <div className={styles.hardware}>
          <div className={styles.vent} aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
          <div className={styles.hullLabel}><span>TR-590</span><span>FIELD INSTRUMENT</span></div>

          <section className={styles.screen} aria-label="Scanner simulation">
            <div className={styles.screenTop}><span>▰ &nbsp; {current.code}</span><span>SIMULATION <b>●</b></span></div>
            <div className={styles.screenTitle}><div><small>ACTIVE SENSOR</small><h1>{current.title}</h1></div><span className={styles.channel}>CH. 0{Object.keys(modes).indexOf(mode) + 1}</span></div>
            <div className={`${styles.scope} ${phase === 'scanning' ? styles.scopeScanning : ''}`}>
              <div className={styles.grid} /><div className={styles.ring1} /><div className={styles.ring2} /><div className={styles.ring3} />
              <div className={styles.crosshair} /><div className={styles.sweep} /><div className={styles.center} />
              {phase === 'complete' && positions.map((position, index) => <button type="button" key={index} aria-label={`Selectează contactul ${index + 1}`} aria-pressed={selectedContact === index} onClick={() => selectContact(index)} className={`${styles.contact} ${selectedContact === index ? styles.contactSelected : ''}`} style={{ left: `${position.x}%`, top: `${position.y}%` }}><span /></button>)}
              {phase === 'complete' && <span className={styles.contactLabel} style={{ left: `${positions[selectedContact].x}%`, top: `${positions[selectedContact].y}%` }}>{finding.name}</span>}
              <div className={styles.scopeLeft}>RANGE<br/><b>025</b><br/>METERS</div><div className={styles.scopeRight}>AZ<br/><b>084°</b><br/>ELEV 00°</div>
              <div className={styles.scopeBottom}><span>SECTOR 04</span><span>{phase === 'complete' ? 'TAP A CONTACT' : '∷ ∷ ∷ ∷ ∷'}</span></div>
            </div>
            <div className={styles.readout} aria-live="polite"><span className={styles.readoutDot} /><span>{phase === 'standby' ? 'READY FOR SCAN' : phase === 'scanning' ? 'SCANNING SECTOR…' : finding.message}</span><small>{phase === 'complete' ? 'COMPLETE' : phase === 'scanning' ? 'ACTIVE' : 'STANDBY'}</small></div>
            <div className={styles.readings}>{current.findings[0].readings.map(([label], index) => <div key={label}><span>{label}</span><strong>{phase === 'complete' ? finding.readings[index][1] : '— —'}</strong></div>)}</div>
          </section>

          <div className={styles.deckHead}><span>SENSOR ARRAY</span><span>SELECT MODE</span></div>
          <div className={styles.modeRow} role="group" aria-label="Select scan mode">{(Object.keys(modes) as Mode[]).map((key, index) => <button key={key} type="button" onClick={() => selectMode(key)} aria-pressed={mode === key} className={`${styles.modeButton} ${mode === key ? styles.selected : ''}`}><small>0{index + 1}</small><span>{modes[key].label}</span><i /></button>)}</div>
          <div className={styles.bottomDeck}>
            <div className={`${styles.signalBars} ${phase === 'scanning' ? styles.signalActive : ''}`} aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>
            <button type="button" className={styles.scanButton} onClick={scan}><span className={styles.scanIcon}>✳</span>{phase === 'scanning' ? 'RESTART SCAN' : phase === 'complete' ? 'SCAN AGAIN' : 'INITIATE SCAN'}</button>
            <div className={styles.deckNumber}>24<span>●</span>07</div>
          </div>
          <div className={styles.foot}><span>STARFLEET PROPERTY · 2369</span><span>SIMULATED READINGS</span></div>
        </div>
      </div>
    </div>
  );
}
