import type { Child, ScheduleEvent } from "./schedule-model";

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
    date: "2026-09-14",
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
export const DEFAULT_EVENTS: ScheduleEvent[] = [
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
export const SCHOOL_EVENTS: ScheduleEvent[] = (
  ["Mina", "Leon"] as Child[]
).flatMap((child) =>
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
export const ACTIVITY_MIGRATION_IDS = new Set(
  [...NEW_LEON_ACTIVITIES, ...NEW_MINA_ACTIVITIES].map((event) => event.id),
);
