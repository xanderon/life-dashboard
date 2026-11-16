'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from './tricorder.module.css';

type Mode = 'life' | 'environment' | 'signal';
type Phase = 'standby' | 'scanning' | 'complete';
type Overlay = 'mission' | 'log' | null;
type Finding = { name: string; message: string; readings: [string, string][] };
type LogEntry = { key: string; mode: Mode; name: string; message: string };

const LOG_KEY = 'tricorder:mission-log:v1';
const objectives: { mode: Mode; message: string; hint: string }[] = [
  { mode: 'life', message: 'Unknown lifeform detected', hint: 'Find an unknown lifeform' },
  { mode: 'environment', message: 'Temperature variation detected', hint: 'Find a temperature anomaly' },
  { mode: 'signal', message: 'Unidentified transmission', hint: 'Find an unidentified signal' },
];

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
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [logLoaded, setLogLoaded] = useState(false);
  const [notice, setNotice] = useState('');
  const current = modes[mode];
  const finding = current.findings[(selectedContact + Math.max(0, sweep - 1)) % current.findings.length];
  const logged = log.some(entry => entry.key === `${mode}:${finding.name}`);
  const completed = objectives.map(objective => log.some(entry => entry.mode === objective.mode && entry.message === objective.message));
  const completedCount = completed.filter(Boolean).length;
  const nextObjective = objectives.find((_, index) => !completed[index]);
  const contacts = positions.map((position, index) => ({
    x: Math.max(20, Math.min(80, position.x + ((sweep * 13 + index * 9) % 17) - 8)),
    y: Math.max(20, Math.min(80, position.y + ((sweep * 7 + index * 5) % 15) - 7)),
  }));

  useEffect(() => {
    if (phase !== 'scanning') return;
    const timer = window.setTimeout(() => setPhase('complete'), 2800);
    return () => window.clearTimeout(timer);
  }, [phase, sweep]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');
        if (Array.isArray(saved)) {
          setLog(saved.filter((entry): entry is LogEntry => entry && typeof entry.key === 'string' &&
            (entry.mode === 'life' || entry.mode === 'environment' || entry.mode === 'signal') &&
            typeof entry.name === 'string' && typeof entry.message === 'string').slice(0, 9));
        }
      } catch { /* A damaged or unavailable local log starts empty. */ }
      setLogLoaded(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!logLoaded) return;
    try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch { /* Storage is optional. */ }
  }, [log, logLoaded]);

  function selectMode(next: Mode) {
    feedback(sound, 540);
    setMode(next); setPhase('standby'); setSelectedContact(0); setOverlay(null); setNotice('');
  }
  function scan() {
    feedback(sound, 740);
    setSelectedContact(0); setSweep(value => value + 1); setPhase('scanning'); setOverlay(null); setNotice('');
  }
  function selectContact(index: number) {
    feedback(sound, 850);
    setSelectedContact(index); setNotice('');
  }
  function logFinding() {
    feedback(sound, 970);
    if (logged) { setNotice('ALREADY IN LOG'); return; }
    const advancesMission = objectives.some((objective, index) => !completed[index] && objective.mode === mode && objective.message === finding.message);
    setLog(previous => [...previous, { key: `${mode}:${finding.name}`, mode, name: finding.name, message: finding.message }]);
    setNotice(advancesMission ? (completedCount === 2 ? 'MISSION COMPLETE!' : 'ANOMALY IDENTIFIED!') : 'SAVED TO MISSION LOG');
  }
  function showOverlay(next: Exclude<Overlay, null>) {
    feedback(sound, 610);
    setOverlay(previous => previous === next ? null : next);
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
              {phase === 'complete' && !overlay && contacts.map((position, index) => <button type="button" key={index} aria-label={`Selectează contactul ${index + 1}`} aria-pressed={selectedContact === index} onClick={() => selectContact(index)} className={`${styles.contact} ${selectedContact === index ? styles.contactSelected : ''}`} style={{ left: `${position.x}%`, top: `${position.y}%` }}><span /></button>)}
              {phase === 'complete' && !overlay && <span className={styles.contactLabel} style={{ left: `${contacts[selectedContact].x}%`, top: `${contacts[selectedContact].y}%` }}>{finding.name}</span>}
              <div className={styles.scopeLeft}>RANGE<br/><b>025</b><br/>METERS</div><div className={styles.scopeRight}>AZ<br/><b>084°</b><br/>ELEV 00°</div>
              <div className={styles.scopeBottom}><span>SECTOR 04</span><span>{phase === 'complete' ? 'TAP A CONTACT' : '∷ ∷ ∷ ∷ ∷'}</span></div>
              {overlay && <div className={styles.overlay}>
                <div className={styles.overlayHeader}><strong>{overlay === 'mission' ? 'MISSION BRIEF' : 'MISSION LOG'}</strong><button type="button" onClick={() => setOverlay(null)} aria-label="Închide">×</button></div>
                {overlay === 'mission' ? <><p>YOUR ASSIGNMENT</p><div className={styles.missionText}>{nextObjective ? nextObjective.hint : 'All anomalies identified. Mission complete!'}</div><div className={styles.missionList}>{objectives.map((objective, index) => <span key={objective.mode} className={completed[index] ? styles.missionDone : ''}>{completed[index] ? '✓' : '○'} {modes[objective.mode].label}</span>)}</div><div className={styles.missionProgress}>{completedCount === 3 ? 'MISSION COMPLETE ✦' : `${completedCount} / 3 ANOMALIES`}</div>{completedCount === 3 && <button type="button" className={styles.restartMission} onClick={() => { if (window.confirm('Start a new mission and clear this device’s discovery log?')) { setLog([]); setNotice('NEW MISSION READY'); setPhase('standby'); setOverlay(null); } }}>NEW MISSION</button>}</> : <div className={styles.logList}>{log.length ? [...log].reverse().map(entry => <div key={entry.key}><span>{modes[entry.mode].label} / {entry.name}</span><strong>{entry.message}</strong></div>) : <p>NO DISCOVERIES YET<br />SCAN, SELECT A CONTACT, THEN SAVE IT.</p>}</div>}
              </div>}
            </div>
            <div className={styles.readout} aria-live="polite"><span className={styles.readoutDot} /><span>{notice || (phase === 'standby' ? (nextObjective ? `MISSION: ${modes[nextObjective.mode].label} / ${nextObjective.hint}` : 'MISSION COMPLETE') : phase === 'scanning' ? 'SCANNING SECTOR…' : finding.message)}</span><small>{phase === 'complete' ? 'COMPLETE' : phase === 'scanning' ? 'ACTIVE' : 'STANDBY'}</small></div>
            <div className={styles.readings}>{current.findings[0].readings.map(([label], index) => <div key={label}><span>{label}</span><strong>{phase === 'complete' ? finding.readings[index][1] : '— —'}</strong></div>)}</div>
          </section>

          <div className={styles.deckHead}><span>SENSOR ARRAY</span><span>SELECT MODE</span></div>
          <div className={styles.modeRow} role="group" aria-label="Select scan mode">{(Object.keys(modes) as Mode[]).map((key, index) => <button key={key} type="button" onClick={() => selectMode(key)} aria-pressed={mode === key} className={`${styles.modeButton} ${mode === key ? styles.selected : ''}`}><small>0{index + 1}</small><span>{modes[key].label}</span><i /></button>)}</div>
          <div className={styles.bottomDeck}>
            <button type="button" className={styles.missionButton} onClick={() => showOverlay('mission')} aria-label={`Misiune: ${completedCount} din 3 anomalii descoperite`}>MISSION <strong>{completedCount}/3</strong></button>
            <button type="button" className={styles.scanButton} onClick={scan}><span className={styles.scanIcon}>✳</span>{phase === 'scanning' ? 'RESTART SCAN' : phase === 'complete' ? 'SCAN AGAIN' : 'INITIATE SCAN'}</button>
            <button type="button" className={styles.logButton} onClick={() => showOverlay('log')} aria-label={`Jurnal: ${log.length} descoperiri`}>LOG <strong>{log.length}</strong></button>
          </div>
          <button type="button" className={styles.saveFinding} onClick={logFinding} disabled={phase !== 'complete' || logged}>{phase !== 'complete' ? 'SELECT A CONTACT TO SAVE' : logged ? '✓ SAVED TO LOG' : '+ SAVE DISCOVERY'}</button>
          <div className={styles.foot}><span>STARFLEET PROPERTY · 2369</span><span>SIMULATED READINGS</span></div>
        </div>
      </div>
    </div>
  );
}
