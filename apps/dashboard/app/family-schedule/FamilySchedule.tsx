"use client";

import {
  ArrowLeft,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Pencil,
  RefreshCw,
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
type Section = "calendar" | "school" | "combined";
type TextSize = "normal" | "comfortable" | "large";
export type ScheduleEvent = {
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
  END_HOUR = 20,
  STORAGE_KEY = "life-dashboard:family-schedule:v1",
  SCHOOL_STORAGE_KEY = "life-dashboard:school-schedule:v7",
  TEXT_SIZE_STORAGE_KEY = "life-dashboard:schedule-text-size:v1";
const FOCUS_REFRESH_KEY = "life-dashboard:schedule-focus-refresh";
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
export const NEW_LEON_ACTIVITIES: ScheduleEvent[] = [
  {
    id: "leon-music-theory-mon",
    child: "Leon",
    day: 0,
    title: "Teorie muzicală",
    start: "16:00",
    end: "17:00",
    kind: "activity",
    notes: "Prof. Liliana Foday",
  },
  {
    id: "leon-parent-meeting-2026-09-14",
    child: "Leon",
    day: 0,
    title: "Ședință cu părinții",
    start: "16:30",
    end: "17:30",
    kind: "activity",
    notes: "",
  },
  {
    id: "leon-cello-tue",
    child: "Leon",
    day: 1,
    title: "Violoncel",
    start: "18:45",
    end: "19:30",
    kind: "activity",
    notes: "Instrument",
  },
  {
    id: "leon-cello-wed",
    child: "Leon",
    day: 2,
    title: "Violoncel",
    start: "14:30",
    end: "16:00",
    kind: "activity",
    notes: "",
  },
  {
    id: "leon-music-theory-wed",
    child: "Leon",
    day: 2,
    title: "Teorie muzicală",
    start: "16:00",
    end: "17:00",
    kind: "activity",
    notes: "",
  },
];
export const NEW_MINA_ACTIVITIES: ScheduleEvent[] = [
  {
    id: "mina-piano-mon",
    child: "Mina",
    day: 0,
    title: "Pian",
    start: "14:00",
    end: "14:50",
    kind: "activity",
    notes: "",
  },
  {
    id: "mina-theory-mon",
    child: "Mina",
    day: 0,
    title: "Teorie muzicală",
    start: "15:00",
    end: "15:50",
    kind: "activity",
    notes: "Prof. Ionescu",
  },
  {
    id: "mina-piano-thu",
    child: "Mina",
    day: 3,
    title: "Pian",
    start: "14:00",
    end: "14:50",
    kind: "activity",
    notes: "",
  },
  {
    id: "mina-theory-thu",
    child: "Mina",
    day: 3,
    title: "Teorie muzicală",
    start: "15:00",
    end: "15:50",
    kind: "activity",
    notes: "Prof. Ionescu",
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
        end:
          child === "Leon"
            ? day === 4
              ? "12:00"
              : day === 0
                ? "13:00"
                : "14:00"
            : "12:00",
        kind: "school" as const,
        notes: "",
      },
      {
        id: `${child}-${day}-sds`,
        child,
        day,
        title: "SDS",
        start:
          child === "Leon"
            ? day === 4
              ? "12:00"
              : day === 0
                ? "13:00"
                : "14:00"
            : "12:00",
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
  ...NEW_MINA_ACTIVITIES,
  ...NEW_LEON_ACTIVITIES,
];
const LEON_TIMETABLE = [
  ["Istorie", "Educație tehnologică", "Română", "Dirigenție", "Engleză"],
  ["Istorie", "Desen", "Franceză", "Biologie", "Matematică", "Engleză"],
  ["Matematică", "Muzică", "Franceză", "Sport", "TIC", "Matematică"],
  ["Geografie", "Religie", "Educație socială", "Română", "Română", "Sport"],
  ["Română", "Matematică", "Engleză", "Biologie"],
];
const MINA_TIMETABLE = [
  ["Limba română", "Matematică", "Limba engleză", "Joc și mișcare"],
  ["Limba română", "Matematică", "Educație civică", "AVAP"],
  ["Limba română", "Matematică", "Religie", "AVAP"],
  ["Limba română", "Matematică", "Muzică și mișcare", "Sport"],
  ["Limba română", "Sport", "Științe ale naturii", "Limba engleză"],
];
const PRIMARY_TIMES = [
  ["08:00", "08:45"],
  ["09:00", "09:45"],
  ["10:05", "10:50"],
  ["11:05", "11:50"],
];
const MIDDLE_SCHOOL_TIMES = [
  ["08:00", "08:50"],
  ["09:00", "09:50"],
  ["10:00", "10:50"],
  ["11:00", "11:50"],
  ["12:00", "12:50"],
  ["13:00", "13:50"],
];
const SCHOOL_EVENTS: ScheduleEvent[] = (["Mina", "Leon"] as Child[]).flatMap(
  (child) =>
    [0, 1, 2, 3, 4].flatMap((day) => {
      const lessonTimes =
        child === "Mina"
          ? PRIMARY_TIMES
          : MIDDLE_SCHOOL_TIMES.slice(0, LEON_TIMETABLE[day].length);
      return lessonTimes.map(([start, end], period) => ({
        id: `lesson-${child}-${day}-${period}`,
        child,
        day,
        title:
          child === "Mina"
            ? MINA_TIMETABLE[day][period]
            : LEON_TIMETABLE[day][period],
        start,
        end,
        kind: "school" as const,
        notes:
          child === "Leon" && day === 1 && period === 2
            ? "Vom face dirigenție"
            : child === "Mina" && day === 1 && period === 0
              ? "Prezentare proiect"
              : "",
      }));
    }),
);
const ACTIVITY_MIGRATION_IDS = new Set(
  [...NEW_LEON_ACTIVITIES, ...NEW_MINA_ACTIVITIES].map((event) => event.id),
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
function isoWeekNumber(date: Date) {
  const value = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((value.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
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
  if (t === "?") return "❔";
  if (t.includes("ședință") || t.includes("sedinta")) return "👥";
  if (t.includes("violoncel")) return "🎻";
  if (t.includes("teorie muzical")) return "🎼";
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
  if (t.includes("fizică") || t.includes("fizica")) return "🏃";
  if (t.includes("muzică") || t.includes("muzica")) return "🎵";
  if (t.includes("mișcare") || t.includes("miscare")) return "🤸";
  if (t.includes("civică") || t.includes("civica")) return "🤝";
  if (t.includes("religie")) return "🕊️";
  if (t.includes("avap")) return "✂️";
  if (t.includes("francez")) return "🇫🇷";
  if (t === "tic") return "💻";
  if (t.includes("istorie")) return "🏛️";
  if (t.includes("geografie")) return "🌍";
  if (t.includes("tehnologic")) return "🛠️";
  if (t.includes("dirigen")) return "🧭";
  if (t.includes("social")) return "🤝";
  if (t.includes("desen")) return "🎨";
  if (t.includes("biologie")) return "🧬";
  if (e.kind === "school") return "🎒";
  if (e.kind === "sds") return "📚";
  return "⭐";
}
function normalizeEvents(items: ScheduleEvent[]) {
  return items.map((event) => {
    const isLeonSchool =
      event.child === "Leon" &&
      event.kind === "school" &&
      event.start === "08:00";
    const isLeonSds = event.child === "Leon" && event.kind === "sds";
    const leonSchoolEnd =
      event.day === 4 ? "12:00" : event.day === 0 ? "13:00" : "14:00";
    return {
      ...event,
      end: isLeonSchool ? leonSchoolEnd : event.end,
      start: isLeonSds ? leonSchoolEnd : event.start,
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

export function FamilySchedule({
  readOnly = false,
  initialEvents,
}: {
  readOnly?: boolean;
  initialEvents?: ScheduleEvent[];
} = {}) {
  const [section, setSection] = useState<Section>("calendar");
  const [textSize, setTextSize] = useState<TextSize>("comfortable");
  const [focusMode, setFocusMode] = useState(false);
  const [focusMenuOpen, setFocusMenuOpen] = useState(false);
  const [events, setEvents] = useState(initialEvents ?? DEFAULT_EVENTS),
    [schoolEvents, setSchoolEvents] = useState(SCHOOL_EVENTS),
    [view, setView] = useState<View>("week"),
    [cursor, setCursor] = useState(new Date());
  const [editing, setEditing] = useState<ScheduleEvent | null>(null),
    [previewing, setPreviewing] = useState<ScheduleEvent | null>(null),
    [form, setForm] = useState<Omit<ScheduleEvent, "id">>(EMPTY_FORM);
  const [ready, setReady] = useState(false),
    [storageMode, setStorageMode] = useState<
      "loading" | "cloud" | "local" | "shared"
    >(readOnly ? "shared" : "loading"),
    [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    queueMicrotask(() => {
      const refreshedSection = sessionStorage.getItem(FOCUS_REFRESH_KEY);
      if (
        refreshedSection === "calendar" ||
        refreshedSection === "school" ||
        refreshedSection === "combined"
      ) {
        sessionStorage.removeItem(FOCUS_REFRESH_KEY);
        setSection(refreshedSection);
        setFocusMode(true);
      }
      if (matchMedia("(max-width: 650px)").matches) setView("day");
      if (readOnly) {
        setReady(true);
        return;
      }
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
        const savedTextSize = localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
        if (
          savedTextSize === "normal" ||
          savedTextSize === "comfortable" ||
          savedTextSize === "large"
        )
          setTextSize(savedTextSize);
      } catch {}
      setReady(true);
    });
    if (readOnly) return () => clearInterval(timer);
    void (async () => {
      const { data, error } = await supabase
        .from("family_schedule_events")
        .select("id,child,day,title,start_time,end_time,kind,notes")
        .order("day");
      if (error) {
        setStorageMode("local");
        return;
      }
      if (data?.length) {
        const loadedEvents = normalizeEvents(
          data
            .filter((r) => r.id !== "leon-cello-mon")
            .map((r) => ({
              id: r.id,
              child: r.child as Child,
              day: r.id === "leon-cello-tue" ? 1 : r.day,
              title: r.title,
              start:
                (r.id === "mina-piano-mon" || r.id === "mina-piano-thu") &&
                r.start_time.slice(0, 5) === "13:00" &&
                r.end_time.slice(0, 5) === "14:00"
                  ? "14:00"
                  : r.id === "leon-cello-tue"
                    ? "18:45"
                    : r.id === "leon-music-theory-mon" &&
                        r.start_time.slice(0, 5) === "17:00" &&
                        r.end_time.slice(0, 5) === "18:00"
                      ? "16:00"
                      : r.id === "leon-cello-wed"
                        ? "14:30"
                        : r.id === "leon-music-theory-wed"
                          ? "16:00"
                          : r.start_time.slice(0, 5),
              end:
                (r.id === "mina-piano-mon" || r.id === "mina-piano-thu") &&
                r.start_time.slice(0, 5) === "13:00" &&
                r.end_time.slice(0, 5) === "14:00"
                  ? "14:50"
                  : r.id === "leon-cello-tue"
                    ? "19:30"
                    : r.id === "leon-music-theory-mon" &&
                        r.start_time.slice(0, 5) === "17:00" &&
                        r.end_time.slice(0, 5) === "18:00"
                      ? "17:00"
                      : r.id === "leon-cello-wed"
                        ? "16:00"
                        : r.id === "leon-music-theory-wed"
                          ? "17:00"
                          : r.end_time.slice(0, 5),
              kind: r.kind as ScheduleEvent["kind"],
              notes:
                r.id === "leon-music-theory-mon" && !r.notes
                  ? "Prof. Liliana Foday"
                  : r.id === "leon-cello-wed" && r.notes === "Instrument"
                    ? ""
                    : (r.notes ?? ""),
            })),
        );
        const missingActivities = DEFAULT_EVENTS.filter(
          (event) =>
            ACTIVITY_MIGRATION_IDS.has(event.id) &&
            !loadedEvents.some((loaded) => loaded.id === event.id),
        );
        setEvents([...loadedEvents, ...missingActivities]);
        const changedActivities = loadedEvents.filter(
          (event) =>
            ((event.id === "mina-piano-mon" || event.id === "mina-piano-thu") &&
              (data
                .find((row) => row.id === event.id)
                ?.start_time.slice(0, 5) !== event.start ||
                data
                  .find((row) => row.id === event.id)
                  ?.end_time.slice(0, 5) !== event.end)) ||
            (event.id === "leon-cello-tue" &&
              (data.find((row) => row.id === event.id)?.day !== event.day ||
                data
                  .find((row) => row.id === event.id)
                  ?.start_time.slice(0, 5) !== event.start ||
                data
                  .find((row) => row.id === event.id)
                  ?.end_time.slice(0, 5) !== event.end)) ||
            (event.id === "leon-music-theory-mon" &&
              (data
                .find((row) => row.id === event.id)
                ?.start_time.slice(0, 5) !== event.start ||
                data
                  .find((row) => row.id === event.id)
                  ?.end_time.slice(0, 5) !== event.end ||
                (data.find((row) => row.id === event.id)?.notes ?? "") !==
                  event.notes)) ||
            (event.id === "leon-cello-wed" &&
              (data
                .find((row) => row.id === event.id)
                ?.start_time.slice(0, 5) !== "14:30" ||
                data
                  .find((row) => row.id === event.id)
                  ?.end_time.slice(0, 5) !== "16:00")) ||
            (event.id === "leon-music-theory-wed" &&
              (data
                .find((row) => row.id === event.id)
                ?.start_time.slice(0, 5) !== "16:00" ||
                data
                  .find((row) => row.id === event.id)
                  ?.end_time.slice(0, 5) !== "17:00")),
        );
        if (missingActivities.length || changedActivities.length) {
          const seeded = await supabase
            .from("family_schedule_events")
            .upsert([...missingActivities, ...changedActivities].map(dbRow));
          if (seeded.error) setStorageMode("local");
        }
        if (data.some((event) => event.id === "leon-cello-mon"))
          await supabase
            .from("family_schedule_events")
            .delete()
            .eq("id", "leon-cello-mon");
      } else {
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
  }, [readOnly]);
  useEffect(() => {
    if (ready && !readOnly)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [events, readOnly, ready]);
  useEffect(() => {
    if (ready && !readOnly)
      localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(schoolEvents));
  }, [readOnly, schoolEvents, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem(TEXT_SIZE_STORAGE_KEY, textSize);
  }, [textSize, ready]);
  useEffect(() => {
    const syncFullscreen = () => {
      if (!document.fullscreenElement) setFocusMode(false);
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  const weekStart = useMemo(() => mondayOf(cursor), [cursor]);
  const visibleDates =
    view === "day"
      ? [cursor]
      : Array.from({ length: focusMode ? 5 : 7 }, (_, i) =>
          addDays(weekStart, i),
        );
  const range =
    view === "day"
      ? new Intl.DateTimeFormat("ro-RO", {
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(cursor)
      : view === "week"
        ? `${label(weekStart)} — ${label(addDays(weekStart, focusMode ? 4 : 6))}`
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
  function openPreview(e: ScheduleEvent) {
    setPreviewing(e);
    requestAnimationFrame(() => {
      (
        document.getElementById("schedule-preview-dialog") as HTMLDialogElement
      )?.showModal();
    });
  }
  function closePreview() {
    (
      document.getElementById("schedule-preview-dialog") as HTMLDialogElement
    )?.close();
    setPreviewing(null);
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
    const editsSchoolSchedule =
      section === "school" ||
      (section === "combined" &&
        editing !== null &&
        schoolEvents.some((event) => event.id === editing.id));
    if (editsSchoolSchedule) {
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
    if (
      section === "school" ||
      (section === "combined" && schoolEvents.some((event) => event.id === id))
    ) {
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
    else if (section === "combined") {
      setSchoolEvents(SCHOOL_EVENTS);
      setEvents(DEFAULT_EVENTS);
    } else setEvents(DEFAULT_EVENTS);
  }
  function switchSection(next: Section) {
    if (next === section) return;
    const doc = document as Document & {
      startViewTransition?: (update: () => void) => unknown;
    };
    if (doc.startViewTransition)
      doc.startViewTransition(() => setSection(next));
    else setSection(next);
  }
  async function toggleFocusMode() {
    if (focusMode) {
      setFocusMode(false);
      if (document.fullscreenElement)
        await document.exitFullscreen().catch(() => {});
      return;
    }
    if (view === "month" || view === "year") setView("week");
    setFocusMode(true);
    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    try {
      if (root.requestFullscreen) await root.requestFullscreen();
      else await root.webkitRequestFullscreen?.();
    } catch {
      // Focus mode still works when an embedded TV browser blocks native fullscreen.
    }
  }
  function refreshInFocus() {
    sessionStorage.setItem(FOCUS_REFRESH_KEY, section);
    window.location.reload();
  }
  const nowTop =
    ((now.getHours() * 60 + now.getMinutes() - START_HOUR * 60) /
      ((END_HOUR - START_HOUR) * 60)) *
    100;
  return (
    <main
      className={`${styles.page} ${focusMode ? styles.focusMode : ""} ${styles[`text-${textSize}`]} ${section === "school" ? styles.schoolMode : section === "combined" ? styles.combinedMode : styles.calendarMode}`}
    >
      {focusMode ? (
        <div
          className={`${styles.focusControls} ${focusMenuOpen ? styles.focusControlsOpen : ""}`}
        >
          {focusMenuOpen ? (
            <div className={styles.focusMenu}>
              {(["calendar", "school", "combined"] as Section[]).map((item) => (
                <button
                  key={item}
                  className={section === item ? styles.focusActive : ""}
                  onClick={() => {
                    switchSection(item);
                    setFocusMenuOpen(false);
                  }}
                >
                  {
                    { calendar: "Calendar", school: "Orar", combined: "Tot" }[
                      item
                    ]
                  }
                </button>
              ))}
              <button onClick={toggleFocusMode} title="Ieși din modul Focus">
                <Minimize2 size={17} />
              </button>
              <button onClick={refreshInFocus} title="Reîncarcă pagina">
                <RefreshCw size={17} />
              </button>
            </div>
          ) : null}
          <button
            className={styles.focusMenuTrigger}
            onClick={() => setFocusMenuOpen((open) => !open)}
            title="Opțiuni vizualizare"
            aria-label="Deschide opțiunile de vizualizare"
          >
            <SlidersHorizontal size={17} />
          </button>
        </div>
      ) : null}
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
          <button
            className={section === "combined" ? styles.activeSection : ""}
            onClick={() => switchSection("combined")}
          >
            Tot
          </button>
        </div>
        {readOnly ? (
          <div className={styles.readOnlyBadge}>🔒 Doar vizualizare</div>
        ) : (
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
        )}
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
            Săpt. {isoWeekNumber(cursor)} ·{" "}
            {storageMode === "cloud"
              ? "☁️ salvat"
              : storageMode === "shared"
                ? "🔒 link privat"
                : storageMode === "local"
                  ? "📱 pe dispozitiv"
                  : "…"}
          </span>
        </strong>
        <div className={styles.toolbarOptions}>
          <div className={styles.textSizeSwitch} aria-label="Mărimea textului">
            {(
              [
                ["normal", "A", "Text normal"],
                ["comfortable", "A+", "Text confortabil"],
                ["large", "A++", "Text foarte mare"],
              ] as const
            ).map(([size, label, title]) => (
              <button
                key={size}
                className={textSize === size ? styles.activeTextSize : ""}
                onClick={() => setTextSize(size)}
                title={title}
                aria-label={title}
              >
                {label}
              </button>
            ))}
          </div>
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
          <button
            className={styles.focusButton}
            onClick={toggleFocusMode}
            title="Mod Focus — fără bare și weekend"
            aria-label="Activează modul Focus"
          >
            <Maximize2 size={15} />
            <span>Focus</span>
          </button>
        </div>
      </section>
      {view === "day" || view === "week" ? (
        <section
          className={`${styles.calendar} ${view === "day" ? styles.dayView : ""}`}
          style={{
            gridTemplateColumns: `${focusMode ? 42 : 56}px repeat(${visibleDates.length}, minmax(${view === "day" ? "280px" : "180px"}, 1fr))`,
          }}
        >
          <div className={styles.corner}>Timp</div>
          {visibleDates.map((d) => (
            <div
              key={iso(d)}
              className={`${styles.dayHead} ${iso(d) === iso(now) ? styles.todayHead : ""} ${dayIndex(d) > 4 ? styles.weekendHead : ""}`}
              aria-current={iso(d) === iso(now) ? "date" : undefined}
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
                {String(START_HOUR + i).padStart(2, "0")}:00
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
                className={`${styles.dayColumn} ${today ? styles.todayColumn : ""} ${di > 4 ? styles.weekendColumn : ""} ${holiday ? styles[`holiday${holiday.tone}`] : ""}`}
                onDoubleClick={() => !readOnly && openNew(di)}
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
                  (section === "school"
                    ? schoolEvents
                    : section === "combined"
                      ? [
                          ...schoolEvents,
                          ...events.filter(
                            (event) => event.kind === "activity",
                          ),
                        ]
                      : events
                  )
                    .filter(
                      (e) =>
                        e.day === di &&
                        (e.id !== "leon-parent-meeting-2026-09-14" ||
                          iso(d) === "2026-09-14"),
                    )
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
                          className={`${styles.event} ${e.notes ? styles.hasNote : ""} ${e.id === "leon-parent-meeting-2026-09-14" ? styles.specialMeeting : ""} ${styles[e.child.toLowerCase()]} ${styles[e.kind]}`}
                          data-duration={mins(e.end) - mins(e.start)}
                          style={{
                            top: `${top}%`,
                            height: `${height}%`,
                            left: e.child === "Mina" ? "1.5%" : "50.75%",
                            viewTransitionName: `bubble-${e.child}-${e.day}-${e.start.replace(":", "")}`,
                            viewTransitionClass: "schedule-bubble",
                          }}
                          onClick={() =>
                            readOnly ? openPreview(e) : openEdit(e)
                          }
                        >
                          <span title={e.title}>
                            <b className={styles.eventEmoji} aria-hidden="true">
                              {emoji(e)}
                            </b>
                            {e.title}
                          </span>
                          <small>
                            {e.start}–{e.end}
                          </small>
                          {e.notes ? (
                            <em
                              title={e.notes}
                              aria-label={`Notiță: ${e.notes}`}
                            >
                              📌
                            </em>
                          ) : null}
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
      {!readOnly ? (
        <dialog id="schedule-dialog" className={styles.dialog}>
          <div className={styles.dialogHead}>
            <div>
              <span>
                {editing ? "Modifică activitatea" : "Activitate nouă"}
              </span>
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
      ) : null}
      {readOnly ? (
        <dialog id="schedule-preview-dialog" className={styles.dialog}>
          <div className={styles.dialogHead}>
            <div>
              <span>{previewing?.child} · detalii</span>
              <h2>
                {previewing ? `${emoji(previewing)} ${previewing.title}` : ""}
              </h2>
            </div>
            <button className={styles.iconButton} onClick={closePreview}>
              <X size={18} />
            </button>
          </div>
          {previewing ? (
            <div className={styles.previewDetails}>
              <strong>
                {DAYS[previewing.day]} · {previewing.start}–{previewing.end}
              </strong>
              {previewing.notes ? <p>📌 {previewing.notes}</p> : null}
            </div>
          ) : null}
          <div className={styles.previewActions}>
            <button className={styles.primaryButton} onClick={closePreview}>
              Închide
            </button>
          </div>
        </dialog>
      ) : null}
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
