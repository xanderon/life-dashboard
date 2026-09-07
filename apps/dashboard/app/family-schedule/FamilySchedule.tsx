'use client';

import { ArrowLeft, CalendarPlus, ChevronLeft, ChevronRight, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import styles from './schedule.module.css';

type Child = 'Mina' | 'Leon';
type ScheduleEvent = { id: string; child: Child; day: number; title: string; start: string; end: string; kind: 'school' | 'sds' | 'activity' };

const DAYS = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];
const SHORT_DAYS = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];
const CHILDREN: Child[] = ['Mina', 'Leon'];
const START_HOUR = 8;
const END_HOUR = 19;
const STORAGE_KEY = 'life-dashboard:family-schedule:v1';
const HOLIDAYS = [
  { name: 'Vacanța de toamnă', emoji: '🍂', start: '2026-10-24', end: '2026-11-01', tone: 0 },
  { name: 'Vacanța de iarnă', emoji: '❄️', start: '2026-12-23', end: '2027-01-10', tone: 1 },
  { name: 'Vacanța mobilă', emoji: '⛷️', start: '2027-02-22', end: '2027-02-28', tone: 2 },
  { name: 'Vacanța de primăvară', emoji: '🌷', start: '2027-04-24', end: '2027-05-04', tone: 3 },
  { name: 'Vacanța de vară', emoji: '☀️', start: '2027-06-19', end: '2027-09-05', tone: 4 },
];

const DEFAULT_EVENTS: ScheduleEvent[] = [
  ...CHILDREN.flatMap((child) => [0, 1, 2, 3, 4].flatMap((day) => [
    { id: `${child}-${day}-school`, child, day, title: 'Școală', start: '08:00', end: '12:00', kind: 'school' as const },
    { id: `${child}-${day}-sds`, child, day, title: 'SDS', start: '12:00', end: '15:00', kind: 'sds' as const },
  ])),
  { id: 'mina-theatre', child: 'Mina', day: 1, title: 'Teatru', start: '17:30', end: '18:30', kind: 'activity' },
  { id: 'mina-piano-mon', child: 'Mina', day: 0, title: 'Pian', start: '13:00', end: '14:00', kind: 'activity' },
  { id: 'mina-piano-thu', child: 'Mina', day: 3, title: 'Pian', start: '13:00', end: '14:00', kind: 'activity' },
];

function minutes(value: string) { const [h, m] = value.split(':').map(Number); return h * 60 + m; }
function mondayOf(date: Date) { const d = new Date(date); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); d.setHours(0, 0, 0, 0); return d; }
function addDays(date: Date, amount: number) { const d = new Date(date); d.setDate(d.getDate() + amount); return d; }
function dateLabel(date: Date) { return new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' }).format(date).replace('.', ''); }
function isoDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function eventEmoji(event: ScheduleEvent) {
  const title = event.title.toLocaleLowerCase('ro');
  if (title.includes('pian')) return '🎹'; if (title.includes('teatru')) return '🎭';
  if (title.includes('înot') || title.includes('inot')) return '🏊'; if (event.kind === 'school') return '🎒';
  if (event.kind === 'sds') return '📚'; return '⭐';
}

const EMPTY_FORM = { child: 'Mina' as Child, day: 0, title: '', start: '15:00', end: '16:00', kind: 'activity' as const };

export function FamilySchedule() {
  const [events, setEvents] = useState<ScheduleEvent[]>(DEFAULT_EVENTS);
  const [weekOffset, setWeekOffset] = useState(0);
  const [editing, setEditing] = useState<ScheduleEvent | null>(null);
  const [form, setForm] = useState<Omit<ScheduleEvent, 'id'>>(EMPTY_FORM);
  const [ready, setReady] = useState(false);
  const [storageMode, setStorageMode] = useState<'loading' | 'cloud' | 'local'>('loading');

  useEffect(() => {
    queueMicrotask(() => {
      try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) setEvents(JSON.parse(saved)); } catch { /* keep defaults */ }
      setReady(true);
    });
    void (async () => {
      const { data, error } = await supabase.from('family_schedule_events').select('id,child,day,title,start_time,end_time,kind').order('day');
      if (error) { setStorageMode('local'); return; }
      if (data?.length) {
        setEvents(data.map((row) => ({ id: row.id, child: row.child as Child, day: row.day, title: row.title, start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5), kind: row.kind as ScheduleEvent['kind'] })));
      } else {
        const { error: seedError } = await supabase.from('family_schedule_events').insert(DEFAULT_EVENTS.map(toDbRow));
        if (seedError) { setStorageMode('local'); return; }
      }
      setStorageMode('cloud');
    })();
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); }, [events, ready]);

  const weekStart = useMemo(() => addDays(mondayOf(new Date()), weekOffset * 7), [weekOffset]);
  const range = `${dateLabel(weekStart)} — ${dateLabel(addDays(weekStart, 6))}`;
  const differentOverlaps = useMemo(() => events.filter((mina) => mina.child === 'Mina').reduce((count, mina) => count + events.filter((leon) => leon.child === 'Leon' && leon.day === mina.day && mina.title !== leon.title && minutes(mina.start) < minutes(leon.end) && minutes(leon.start) < minutes(mina.end)).length, 0), [events]);

  function openNew(day = 0, child: Child = 'Mina') { setEditing(null); setForm({ ...EMPTY_FORM, day, child }); }
  function openEdit(event: ScheduleEvent) { setEditing(event); setForm({ child: event.child, day: event.day, title: event.title, start: event.start, end: event.end, kind: event.kind }); }
  function closeModal() { setEditing(null); setForm(EMPTY_FORM); (document.getElementById('schedule-dialog') as HTMLDialogElement)?.close(); }
  function showModal() { (document.getElementById('schedule-dialog') as HTMLDialogElement)?.showModal(); }
  function save() {
    if (!form.title.trim() || minutes(form.end) <= minutes(form.start)) return;
    const next = { ...form, title: form.title.trim(), id: editing?.id ?? crypto.randomUUID() };
    setEvents((current) => editing ? current.map((event) => event.id === editing.id ? next : event) : [...current, next]);
    void supabase.from('family_schedule_events').upsert(toDbRow(next)).then(({ error }) => { if (error) setStorageMode('local'); });
    closeModal();
  }
  function remove(id: string) { setEvents((current) => current.filter((event) => event.id !== id)); void supabase.from('family_schedule_events').delete().eq('id', id).then(({ error }) => { if (error) setStorageMode('local'); }); closeModal(); }
  function reset() { if (window.confirm('Revii la orarul inițial? Modificările tale vor fi șterse.')) { setEvents(DEFAULT_EVENTS); void (async () => { const removed = await supabase.from('family_schedule_events').delete().neq('id', ''); if (!removed.error) await supabase.from('family_schedule_events').insert(DEFAULT_EVENTS.map(toDbRow)); else setStorageMode('local'); })(); } }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <Link href="/" className={styles.iconButton} aria-label="Înapoi la dashboard"><ArrowLeft size={18} /></Link>
          <div><div className={styles.eyebrow}>Familie · program săptămânal</div><h1>Orar Mina & Leon</h1></div>
        </div>
        <div className={styles.actions}>
          <button className={styles.ghostButton} onClick={reset} title="Revino la orarul inițial"><RotateCcw size={16} /><span>Resetează</span></button>
          <button className={styles.primaryButton} onClick={() => { openNew(); showModal(); }}><CalendarPlus size={17} />Adaugă</button>
        </div>
      </header>

      <section className={styles.toolbar}>
        <div className={styles.weekNav}>
          <button className={styles.iconButton} onClick={() => setWeekOffset((v) => v - 1)} aria-label="Săptămâna trecută"><ChevronLeft size={18} /></button>
          <button className={styles.todayButton} onClick={() => setWeekOffset(0)}>Astăzi</button>
          <button className={styles.iconButton} onClick={() => setWeekOffset((v) => v + 1)} aria-label="Săptămâna următoare"><ChevronRight size={18} /></button>
        </div>
        <strong>{range} <span className={styles.syncState}>{storageMode === 'cloud' ? '☁️ salvat' : storageMode === 'local' ? '📱 local' : '…'}</span></strong>
        <div className={styles.legend}>
          {differentOverlaps > 0 ? <span className={styles.overlapBadge}>{differentOverlaps} {differentOverlaps === 1 ? 'suprapunere diferită' : 'suprapuneri diferite'}</span> : null}
          <span><i className={styles.minaDot} />Mina</span><span><i className={styles.leonDot} />Leon</span>
        </div>
      </section>

      <section className={styles.calendar}>
        <div className={styles.corner}>Ora</div>
        {DAYS.map((day, index) => <div key={day} className={styles.dayHead}><b>{SHORT_DAYS[index]}</b><span>{dateLabel(addDays(weekStart, index))}</span></div>)}
        <div className={styles.timeRail}>{Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => <span key={i} style={{ top: `${(i / (END_HOUR - START_HOUR)) * 100}%` }}>{String(START_HOUR + i).padStart(2, '0')}:00</span>)}</div>
        {DAYS.map((day, dayIndex) => (
          (() => { const holiday = HOLIDAYS.find((item) => { const date = isoDate(addDays(weekStart, dayIndex)); return date >= item.start && date <= item.end; }); return <div key={day} className={`${styles.dayColumn} ${holiday ? styles[`holiday${holiday.tone}`] : ''}`} onDoubleClick={() => { openNew(dayIndex); showModal(); }}>
            {holiday ? <div className={styles.holidayLabel}>{holiday.emoji} {holiday.name}</div> : null}
            <div className={styles.gridLines}>{Array.from({ length: END_HOUR - START_HOUR }, (_, i) => <i key={i} style={{ top: `${(i / (END_HOUR - START_HOUR)) * 100}%` }} />)}</div>
            <div className={styles.laneDivider} />
            {!holiday && events.filter((event) => event.day === dayIndex).map((event) => {
              const start = Math.max(minutes(event.start), START_HOUR * 60);
              const end = Math.min(minutes(event.end), END_HOUR * 60);
              if (end <= start) return null;
              const top = ((start - START_HOUR * 60) / ((END_HOUR - START_HOUR) * 60)) * 100;
              const height = ((end - start) / ((END_HOUR - START_HOUR) * 60)) * 100;
              return <button key={event.id} className={`${styles.event} ${styles[event.child.toLowerCase()]} ${styles[event.kind]}`} style={{ top: `${top}%`, height: `${height}%`, left: event.child === 'Mina' ? '2%' : '51%' }} onClick={() => { openEdit(event); showModal(); }} title={`${event.child}: ${event.title}, ${event.start}–${event.end}`}><span>{eventEmoji(event)} {event.title}</span><small>{event.start}–{event.end}</small></button>;
            })}
          </div>; })()
        ))}
      </section>
      <p className={styles.hint}>Click pe o activitate pentru editare · dublu-click într-o zi pentru adăugare</p>

      <dialog id="schedule-dialog" className={styles.dialog} onClose={() => { setEditing(null); setForm(EMPTY_FORM); }}>
        <div className={styles.dialogHead}><div><span>{editing ? 'Modifică activitatea' : 'Activitate nouă'}</span><h2>{form.title || 'Detalii program'}</h2></div><button className={styles.iconButton} onClick={closeModal} aria-label="Închide"><X size={18} /></button></div>
        <div className={styles.formGrid}>
          <label className={styles.full}>Activitate<input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ex. Pian, Înot, SDS" /></label>
          <label>Copil<select value={form.child} onChange={(e) => setForm({ ...form, child: e.target.value as Child })}><option>Mina</option><option>Leon</option></select></label>
          <label>Zi<select value={form.day} onChange={(e) => setForm({ ...form, day: Number(e.target.value) })}>{DAYS.map((day, i) => <option value={i} key={day}>{day}</option>)}</select></label>
          <label>De la<input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></label>
          <label>Până la<input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label>
        </div>
        <div className={styles.dialogActions}>{editing ? <button className={styles.deleteButton} onClick={() => remove(editing.id)}><Trash2 size={16} />Șterge</button> : <span />}<div><button className={styles.ghostButton} onClick={closeModal}>Renunță</button><button className={styles.primaryButton} onClick={save}><Pencil size={16} />Salvează</button></div></div>
      </dialog>
    </main>
  );
}

function toDbRow(event: ScheduleEvent) { return { id: event.id, child: event.child, day: event.day, title: event.title, start_time: event.start, end_time: event.end, kind: event.kind }; }
