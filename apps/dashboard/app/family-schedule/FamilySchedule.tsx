"use client";

import {
  ArrowLeft,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import styles from "./schedule.module.css";

type Child = "Mina" | "Leon";
type View = "day" | "week" | "month" | "year";
type ScheduleEvent = {
  id: string;
  child: Child;
  day: number;
  title: string;
  start: string;
  end: string;
  kind: "school" | "sds" | "activity";
  notes: string;
};
const DAYS = [
  "Luni",
  "Marți",
  "Miercuri",
  "Joi",
  "Vineri",
  "Sâmbătă",
  "Duminică",
];
const SHORT_DAYS = ["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"];
const MONTHS = [
  "Ianuarie",
  "Februarie",
  "Martie",
  "Aprilie",
  "Mai",
  "Iunie",
  "Iulie",
  "August",
  "Septembrie",
  "Octombrie",
  "Noiembrie",
  "Decembrie",
];
const START_HOUR = 8,
  END_HOUR = 19,
  STORAGE_KEY = "life-dashboard:family-schedule:v1",
  SCHOOL_STORAGE_KEY = "life-dashboard:school-schedule:v1";
const HOLIDAYS = [
  {
    name: "Vacanța de toamnă",
    emoji: "🍂",
    start: "2026-10-24",
    end: "2026-11-01",
    tone: 0,
  },
  {
    name: "Vacanța de iarnă",
    emoji: "❄️",
    start: "2026-12-23",
    end: "2027-01-10",
    tone: 1,
  },
  {
    name: "Vacanța mobilă",
    emoji: "⛷️",
    start: "2027-02-22",
    end: "2027-02-28",
    tone: 2,
  },
  {
    name: "Vacanța de primăvară",
    emoji: "🌷",
    start: "2027-04-24",
    end: "2027-05-04",
    tone: 3,
  },
  {
    name: "Vacanța de vară",
    emoji: "☀️",
    start: "2027-06-19",
    end: "2027-09-05",
    tone: 4,
  },
];
const DEFAULT_EVENTS: ScheduleEvent[] = [
  ...(["Mina", "Leon"] as Child[]).flatMap((child) =>
    [0, 1, 2, 3, 4].flatMap((day) => [
      {
        id: `${child}-${day}-school`,
        child,
        day,
        title: "Școală",
        start: "08:00",
        end: child === "Leon" ? "13:00" : "12:00",
        kind: "school" as const,
        notes: "",
      },
      {
        id: `${child}-${day}-sds`,
        child,
        day,
        title: "SDS",
        start: child === "Leon" ? "13:00" : "12:00",
        end: "15:00",
        kind: "sds" as const,
        notes: "",
      },
    ]),
  ),
  {
    id: "mina-theatre",
    child: "Mina",
    day: 1,
    title: "Teatru",
    start: "17:30",
    end: "18:30",
    kind: "activity",
    notes: "",
  },
  {
    id: "mina-piano-mon",
    child: "Mina",
    day: 0,
    title: "Pian",
    start: "13:00",
    end: "14:00",
    kind: "activity",
    notes: "",
  },
  {
    id: "mina-piano-thu",
    child: "Mina",
    day: 3,
    title: "Pian",
    start: "13:00",
    end: "14:00",
    kind: "activity",
    notes: "",
  },
];
const SCHOOL_SUBJECTS = [
  "Română",
  "Matematică",
  "Engleză",
  "Științe",
  "Arte",
  "Sport",
];
const SCHOOL_EVENTS: ScheduleEvent[] = (["Mina", "Leon"] as Child[]).flatMap(
  (child, childIndex) =>
    [0, 1, 2, 3, 4].flatMap((day) =>
      Array.from({ length: child === "Leon" ? 5 : 4 }, (_, period) => ({
        id: `lesson-${child}-${day}-${period}`,
        child,
        day,
        title:
          SCHOOL_SUBJECTS[
            (day * 2 + period + childIndex) % SCHOOL_SUBJECTS.length
          ],
        start: `${String(8 + period).padStart(2, "0")}:00`,
        end: `${String(9 + period).padStart(2, "0")}:00`,
        kind: "school" as const,
        notes: day === 1 && period === childIndex ? "Prezentare proiect" : "",
      })),
    ),
);
const EMPTY_FORM = {
  child: "Mina" as Child,
  day: 0,
  title: "",
  start: "15:00",
  end: "16:00",
  kind: "activity" as const,
  notes: "",
};
function mins(v: string) {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function mondayOf(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - (x.getDay() || 7) + 1);
  x.setHours(0, 0, 0, 0);
  return x;
}
function dayIndex(d: Date) {
  return (d.getDay() + 6) % 7;
}
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function label(d: Date) {
  return new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "short" })
    .format(d)
    .replace(".", "");
}
function holidayFor(d: Date) {
  const value = iso(d);
  return HOLIDAYS.find((h) => value >= h.start && value <= h.end);
}
function emoji(e: ScheduleEvent) {
  const t = e.title.toLowerCase();
  if (t.includes("pian")) return "🎹";
  if (t.includes("teatru")) return "🎭";
  if (t.includes("test")) return "📝";
  if (t.includes("înot") || t.includes("inot")) return "🏊";
  if (t.includes("română") || t.includes("romana")) return "📖";
  if (t.includes("matematic")) return "🔢";
  if (t.includes("englez")) return "🇬🇧";
  if (t.includes("știin") || t.includes("stiin")) return "🔬";
  if (t.includes("arte")) return "🎨";
  if (t.includes("sport")) return "⚽";
  if (e.kind === "school") return "🎒";
  if (e.kind === "sds") return "📚";
  return "⭐";
}
function normalizeEvents(items: ScheduleEvent[]) {
  return items.map((event) => {
    const isLeonSchool =
      event.child === "Leon" &&
      event.kind === "school" &&
      event.start === "08:00" &&
      event.end === "12:00";
    const isLeonSds =
      event.child === "Leon" && event.kind === "sds" && event.start === "12:00";
    return {
      ...event,
      end: isLeonSchool ? "13:00" : event.end,
      start: isLeonSds ? "13:00" : event.start,
      notes: event.notes ?? "",
    };
  });
}
function dbRow(e: ScheduleEvent) {
  return {
    id: e.id,
    child: e.child,
    day: e.day,
    title: e.title,
    start_time: e.start,
    end_time: e.end,
    kind: e.kind,
    notes: e.notes,
  };
}

export function FamilySchedule() {
  const [section, setSection] = useState<"calendar" | "school">("calendar");
  const [events, setEvents] = useState(DEFAULT_EVENTS),
    [schoolEvents, setSchoolEvents] = useState(SCHOOL_EVENTS),
    [view, setView] = useState<View>("week"),
    [cursor, setCursor] = useState(new Date());
  const [editing, setEditing] = useState<ScheduleEvent | null>(null),
    [form, setForm] = useState<Omit<ScheduleEvent, "id">>(EMPTY_FORM);
  const [ready, setReady] = useState(false),
    [storageMode, setStorageMode] = useState<"loading" | "cloud" | "local">(
      "loading",
    ),
    [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    queueMicrotask(() => {
      if (matchMedia("(max-width: 650px)").matches) setView("day");
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved)
          setEvents(normalizeEvents(JSON.parse(saved) as ScheduleEvent[]));
        const savedSchool = localStorage.getItem(SCHOOL_STORAGE_KEY);
        if (savedSchool)
          setSchoolEvents(
            (JSON.parse(savedSchool) as ScheduleEvent[]).map((e) => ({
              ...e,
              notes: e.notes ?? "",
            })),
          );
      } catch {}
      setReady(true);
    });
    void (async () => {
      const { data, error } = await supabase
        .from("family_schedule_events")
        .select("id,child,day,title,start_time,end_time,kind,notes")
        .order("day");
      if (error) {
        setStorageMode("local");
        return;
      }
      if (data?.length)
        setEvents(
          normalizeEvents(
            data.map((r) => ({
              id: r.id,
              child: r.child as Child,
              day: r.day,
              title: r.title,
              start: r.start_time.slice(0, 5),
              end: r.end_time.slice(0, 5),
              kind: r.kind as ScheduleEvent["kind"],
              notes: r.notes ?? "",
            })),
          ),
        );
      else {
        const seeded = await supabase
          .from("family_schedule_events")
          .insert(DEFAULT_EVENTS.map(dbRow));
        if (seeded.error) {
          setStorageMode("local");
          return;
        }
      }
      setStorageMode("cloud");
    })();
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [events, ready]);
  useEffect(() => {
    if (ready)
      localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(schoolEvents));
  }, [schoolEvents, ready]);
  const weekStart = useMemo(() => mondayOf(cursor), [cursor]);
  const visibleDates =
    view === "day"
      ? [cursor]
      : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const range =
    view === "day"
      ? new Intl.DateTimeFormat("ro-RO", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(cursor)
      : view === "week"
        ? `${label(weekStart)} — ${label(addDays(weekStart, 6))}`
        : view === "month"
          ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
          : `${cursor.getFullYear()}`;
  function move(delta: number) {
    const d = new Date(cursor);
    if (view === "day") d.setDate(d.getDate() + delta);
    if (view === "week") d.setDate(d.getDate() + delta * 7);
    if (view === "month") d.setMonth(d.getMonth() + delta);
    if (view === "year") d.setFullYear(d.getFullYear() + delta);
    setCursor(d);
  }
  function show() {
    (
      document.getElementById("schedule-dialog") as HTMLDialogElement
    )?.showModal();
  }
  function openNew(day = dayIndex(cursor), child: Child = "Mina") {
    setEditing(null);
    setForm({ ...EMPTY_FORM, day, child });
    show();
  }
  function openEdit(e: ScheduleEvent) {
    setEditing(e);
    setForm({
      child: e.child,
      day: e.day,
      title: e.title,
      start: e.start,
      end: e.end,
      kind: e.kind,
      notes: e.notes,
    });
    show();
  }
  function close() {
    setEditing(null);
    setForm(EMPTY_FORM);
    (document.getElementById("schedule-dialog") as HTMLDialogElement)?.close();
  }
  function save() {
    if (!form.title.trim() || mins(form.end) <= mins(form.start)) return;
    const next = {
      ...form,
      title: form.title.trim(),
      id: editing?.id ?? crypto.randomUUID(),
    };
    if (section === "school") {
      setSchoolEvents((x) =>
        editing ? x.map((e) => (e.id === editing.id ? next : e)) : [...x, next],
      );
      close();
      return;
    }
    setEvents((x) =>
      editing ? x.map((e) => (e.id === editing.id ? next : e)) : [...x, next],
    );
    void supabase
      .from("family_schedule_events")
      .upsert(dbRow(next))
      .then(({ error }) => {
        if (error) setStorageMode("local");
      });
    close();
  }
  function remove(id: string) {
    if (section === "school") {
      setSchoolEvents((x) => x.filter((e) => e.id !== id));
      close();
      return;
    }
    setEvents((x) => x.filter((e) => e.id !== id));
    void supabase.from("family_schedule_events").delete().eq("id", id);
    close();
  }
  function reset() {
    if (!confirm("Revii la orarul inițial?")) return;
    if (section === "school") setSchoolEvents(SCHOOL_EVENTS);
    else setEvents(DEFAULT_EVENTS);
  }
  function switchSection(next: "calendar" | "school") {
    if (next === section) return;
    const root = document.documentElement;
    root.dataset.scheduleDirection = next === "school" ? "forward" : "back";
    const doc = document as Document & {
      startViewTransition?: (update: () => void) => unknown;
    };
    if (doc.startViewTransition)
      doc.startViewTransition(() => setSection(next));
    else setSection(next);
  }
  const nowTop =
    ((now.getHours() * 60 + now.getMinutes() - START_HOUR * 60) /
      ((END_HOUR - START_HOUR) * 60)) *
    100;
  return (
    <main
      className={`${styles.page} ${section === "school" ? styles.schoolMode : styles.calendarMode}`}
    >
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <Link href="/" className={styles.iconButton}>
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className={styles.eyebrow}>Familie · calendar</div>
            <h1>Orar Mina & Leon</h1>
          </div>
        </div>
        <div className={styles.sectionSwitch}>
          <button
            className={section === "calendar" ? styles.activeSection : ""}
            onClick={() => switchSection("calendar")}
          >
            Calendar
          </button>
          <button
            className={section === "school" ? styles.activeSection : ""}
            onClick={() => switchSection("school")}
          >
            Orar
          </button>
        </div>
        <div className={styles.actions}>
          <button className={styles.ghostButton} onClick={reset}>
            <RotateCcw size={16} />
            <span>Resetează</span>
          </button>
          <button className={styles.primaryButton} onClick={() => openNew()}>
            <CalendarPlus size={17} />
            Adaugă
          </button>
        </div>
      </header>
      <section className={styles.toolbar}>
        <div className={styles.weekNav}>
          <button className={styles.iconButton} onClick={() => move(-1)}>
            <ChevronLeft size={18} />
          </button>
          <button
            className={styles.todayButton}
            onClick={() => setCursor(new Date())}
          >
            Astăzi
          </button>
          <button className={styles.iconButton} onClick={() => move(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
        <strong className={styles.range}>
          {range}
          <span className={styles.syncState}>
            {storageMode === "cloud"
              ? "☁️ salvat"
              : storageMode === "local"
                ? "📱 pe dispozitiv"
                : "…"}
          </span>
        </strong>
        <div className={styles.viewSwitch}>
          {(["day", "week", "month", "year"] as View[]).map((v) => (
            <button
              key={v}
              className={view === v ? styles.activeView : ""}
              onClick={() => setView(v)}
            >
              {{ day: "Zi", week: "Săptămână", month: "Lună", year: "An" }[v]}
            </button>
          ))}
        </div>
      </section>
      {view === "day" || view === "week" ? (
        <section
          className={`${styles.calendar} ${view === "day" ? styles.dayView : ""}`}
          style={{
            gridTemplateColumns: `56px repeat(${visibleDates.length}, minmax(${view === "day" ? "280px" : "105px"}, 1fr))`,
          }}
        >
          <div className={styles.corner}>Timp</div>
          {visibleDates.map((d) => (
            <div
              key={iso(d)}
              className={`${styles.dayHead} ${dayIndex(d) > 4 ? styles.weekendHead : ""}`}
            >
              <div className={styles.dayTitle}>
                <b>{SHORT_DAYS[dayIndex(d)]}</b>
                <span>{label(d)}</span>
              </div>
              <div className={styles.laneNames}>
                <span>Mina</span>
                <span>Leon</span>
              </div>
            </div>
          ))}
          <div className={styles.timeRail}>
            {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => (
              <span
                key={i}
                className={
                  i === 0
                    ? styles.firstTime
                    : i === END_HOUR - START_HOUR
                      ? styles.lastTime
                      : ""
                }
                style={{ top: `${(i / (END_HOUR - START_HOUR)) * 100}%` }}
              >
                {START_HOUR + i}
              </span>
            ))}
          </div>
          {visibleDates.map((d) => {
            const di = dayIndex(d),
              holiday = holidayFor(d),
              today = iso(d) === iso(now);
            return (
              <div
                key={iso(d)}
                className={`${styles.dayColumn} ${di > 4 ? styles.weekendColumn : ""} ${holiday ? styles[`holiday${holiday.tone}`] : ""}`}
                onDoubleClick={() => openNew(di)}
              >
                {holiday ? (
                  <div className={styles.holidayLabel}>
                    {holiday.emoji} {holiday.name}
                  </div>
                ) : null}
                <div className={styles.gridLines}>
                  {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                    <i
                      key={i}
                      style={{ top: `${(i / (END_HOUR - START_HOUR)) * 100}%` }}
                    />
                  ))}
                </div>
                <div className={styles.laneDivider} />
                {today && nowTop >= 0 && nowTop <= 100 ? (
                  <div className={styles.nowLine} style={{ top: `${nowTop}%` }}>
                    <span>
                      {now.toLocaleTimeString("ro-RO", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ) : null}
                {!holiday &&
                  (section === "school" ? schoolEvents : events)
                    .filter((e) => e.day === di)
                    .map((e) => {
                      const top =
                          ((Math.max(mins(e.start), START_HOUR * 60) -
                            START_HOUR * 60) /
                            ((END_HOUR - START_HOUR) * 60)) *
                          100,
                        height =
                          ((Math.min(mins(e.end), END_HOUR * 60) -
                            Math.max(mins(e.start), START_HOUR * 60)) /
                            ((END_HOUR - START_HOUR) * 60)) *
                          100;
                      if (height <= 0) return null;
                      return (
                        <button
                          key={e.id}
                          className={`${styles.event} ${styles[e.child.toLowerCase()]} ${styles[e.kind]}`}
                          style={{
                            top: `${top}%`,
                            height: `${height}%`,
                            left: e.child === "Mina" ? "1.5%" : "50.75%",
                            viewTransitionName: `bubble-${e.child}-${e.day}-${e.start.replace(":", "")}`,
                            viewTransitionClass: "schedule-bubble",
                          }}
                          onClick={() => openEdit(e)}
                        >
                          <span>
                            <b className={styles.eventEmoji} aria-hidden="true">
                              {emoji(e)}
                            </b>
                            {e.title}
                          </span>
                          <small>
                            {e.start}–{e.end}
                          </small>
                          {e.notes ? <em>📝 {e.notes}</em> : null}
                        </button>
                      );
                    })}
              </div>
            );
          })}
        </section>
      ) : view === "month" ? (
        <MonthView
          cursor={cursor}
          events={events}
          onDay={(d) => {
            setCursor(d);
            setView("day");
          }}
        />
      ) : (
        <YearView
          cursor={cursor}
          onMonth={(month) => {
            const d = new Date(cursor);
            d.setMonth(month);
            setCursor(d);
            setView("month");
          }}
        />
      )}
      <dialog id="schedule-dialog" className={styles.dialog}>
        <div className={styles.dialogHead}>
          <div>
            <span>{editing ? "Modifică activitatea" : "Activitate nouă"}</span>
            <h2>{form.title || "Detalii program"}</h2>
          </div>
          <button className={styles.iconButton} onClick={close}>
            <X size={18} />
          </button>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.full}>
            Activitate
            <input
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="ex. Pian, test la matematică"
            />
          </label>
          <label>
            Copil
            <select
              value={form.child}
              onChange={(e) =>
                setForm({ ...form, child: e.target.value as Child })
              }
            >
              <option>Mina</option>
              <option>Leon</option>
            </select>
          </label>
          <label>
            Zi
            <select
              value={form.day}
              onChange={(e) =>
                setForm({ ...form, day: Number(e.target.value) })
              }
            >
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            De la
            <input
              type="time"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
          </label>
          <label>
            Până la
            <input
              type="time"
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            />
          </label>
          <label className={styles.full}>
            Notiță
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="ex. Test la matematică · capitolul 3"
              rows={3}
            />
          </label>
        </div>
        <div className={styles.dialogActions}>
          {editing ? (
            <button
              className={styles.deleteButton}
              onClick={() => remove(editing.id)}
            >
              <Trash2 size={16} />
              Șterge
            </button>
          ) : (
            <span />
          )}
          <div>
            <button className={styles.ghostButton} onClick={close}>
              Renunță
            </button>
            <button className={styles.primaryButton} onClick={save}>
              <Pencil size={16} />
              Salvează
            </button>
          </div>
        </div>
      </dialog>
    </main>
  );
}

function MonthView({
  cursor,
  events,
  onDay,
}: {
  cursor: Date;
  events: ScheduleEvent[];
  onDay: (d: Date) => void;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1),
    start = mondayOf(first);
  return (
    <section className={styles.monthView}>
      <div className={styles.monthWeekdays}>
        {SHORT_DAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className={styles.monthGrid}>
        {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => {
          const other = d.getMonth() !== cursor.getMonth(),
            holiday = holidayFor(d),
            count = events.filter((e) => e.day === dayIndex(d)).length;
          return (
            <button
              key={iso(d)}
              className={`${styles.monthDay} ${other ? styles.otherMonth : ""}`}
              onClick={() => onDay(d)}
            >
              <b>{d.getDate()}</b>
              {holiday ? (
                <span>
                  {holiday.emoji} {holiday.name}
                </span>
              ) : count ? (
                <>
                  <span className={styles.minaSummary}>● Mina</span>
                  <span className={styles.leonSummary}>● Leon</span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
function YearView({
  cursor,
  onMonth,
}: {
  cursor: Date;
  onMonth: (m: number) => void;
}) {
  return (
    <section className={styles.yearView}>
      {MONTHS.map((name, m) => (
        <button key={name} onClick={() => onMonth(m)}>
          <b>{name}</b>
          <MiniMonth year={cursor.getFullYear()} month={m} />
        </button>
      ))}
    </section>
  );
}
function MiniMonth({ year, month }: { year: number; month: number }) {
  const first = new Date(year, month, 1),
    start = mondayOf(first);
  return (
    <div className={styles.miniGrid}>
      {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
        <i key={i}>{d}</i>
      ))}
      {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => (
        <span
          key={iso(d)}
          className={`${d.getMonth() !== month ? styles.dim : ""} ${holidayFor(d) ? styles.miniHoliday : ""}`}
        >
          {d.getDate()}
        </span>
      ))}
    </div>
  );
}
