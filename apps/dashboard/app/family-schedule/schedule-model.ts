export type Child = "Mina" | "Leon";

/** Shared by seed data, UI and a future database repository. */
export type ScheduleEvent = {
  id: string;
  child: Child;
  day: number;
  title: string;
  start: string;
  end: string;
  kind: "school" | "sds" | "activity";
  notes: string;
  /** Local calendar date. Omitted means a weekly recurring event. */
  date?: string;
};

export interface ScheduleRepository {
  load(): Promise<ScheduleEvent[]>;
  save(event: ScheduleEvent): Promise<void>;
  remove(id: string): Promise<void>;
}

export function occursOn(event: ScheduleEvent, date: string, day: number) {
  // Compatibility for saved rows predating the date field.
  const once =
    event.date ??
    (event.id === "leon-parent-meeting-2026-09-14" ? "2026-09-14" : undefined);
  return once ? once === date : event.day === day;
}

const minutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/** Stagger overlapping cards, leaving a reachable strip for every event. */
export function overlapLayout(events: ScheduleEvent[]) {
  const result = new Map<string, { index: number; count: number }>();
  for (const child of ["Mina", "Leon"] as const) {
    const ordered = events
      .filter((e) => e.child === child)
      .sort(
        (a, b) =>
          minutes(a.start) - minutes(b.start) ||
          minutes(b.end) - minutes(a.end) ||
          a.id.localeCompare(b.id),
      );
    let group: ScheduleEvent[] = [];
    let end = -1;
    const flush = () => {
      group.forEach((e, index) =>
        result.set(e.id, { index, count: group.length }),
      );
    };
    for (const event of ordered) {
      if (minutes(event.start) >= end) {
        flush();
        group = [];
      }
      group.push(event);
      end = Math.max(...group.map((e) => minutes(e.end)));
    }
    flush();
  }
  return result;
}
