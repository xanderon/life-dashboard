import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  DEFAULT_EVENTS,
  NEW_LEON_ACTIVITIES,
  NEW_MINA_ACTIVITIES,
  updateLeonMusic,
} from "../../../../family-schedule/schedule-data";
import type { ScheduleEvent } from "../../../../family-schedule/schedule-model";

export const dynamic = "force-dynamic";

const SHARE_TOKEN_HASH =
  "a8728c803e339c76e1aed439ca71dbad49fbe1266d16585fd162c3f9a5766e55";

const HOLIDAYS = [
  { name: "Vacanța de toamnă", emoji: "🍂", start: "2026-10-24", end: "2026-11-01" },
  { name: "Vacanța de iarnă", emoji: "❄️", start: "2026-12-23", end: "2027-01-10" },
  { name: "Vacanța mobilă", emoji: "⛷️", start: "2027-02-22", end: "2027-02-28" },
  { name: "Vacanța de primăvară", emoji: "🌷", start: "2027-04-24", end: "2027-05-04" },
  { name: "Vacanța de vară", emoji: "☀️", start: "2027-06-19", end: "2027-09-05" },
];

function validToken(token: string) {
  if (token.length < 32 || token.length > 128) return false;
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"));
  const expected = Buffer.from(SHARE_TOKEN_HASH);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeRow(row: {
  id: string;
  child: string;
  day: number;
  title: string;
  start_time: string;
  end_time: string;
  kind: string;
  notes?: string | null;
}): ScheduleEvent {
  const start = row.start_time.slice(0, 5);
  const end = row.end_time.slice(0, 5);
  return {
    id: row.id,
    child: row.child as ScheduleEvent["child"],
    day: row.id === "leon-cello-tue" ? 1 : row.day,
    title: row.title,
    start:
      (row.id === "mina-piano-mon" || row.id === "mina-piano-thu") &&
      start === "13:00" &&
      end === "14:00"
        ? "14:00"
        : row.id === "leon-cello-tue"
          ? "18:00"
          : row.id === "leon-music-theory-mon" && start === "17:00" && end === "18:00"
            ? "16:00"
            : row.id === "leon-cello-wed"
              ? "14:30"
              : row.id === "leon-music-theory-wed"
                ? "16:00"
                : start,
    end:
      (row.id === "mina-piano-mon" || row.id === "mina-piano-thu") &&
      start === "13:00" &&
      end === "14:00"
        ? "14:50"
        : row.id === "leon-cello-tue"
          ? "19:00"
          : row.id === "leon-music-theory-mon" && start === "17:00" && end === "18:00"
            ? "17:00"
            : row.id === "leon-cello-wed"
              ? "16:00"
              : row.id === "leon-music-theory-wed"
                ? "17:00"
                : end,
    kind: row.kind as ScheduleEvent["kind"],
    notes:
      row.id === "leon-music-theory-mon" && !row.notes
        ? "Prof. Liliana Foday"
        : row.id === "leon-cello-wed" && row.notes === "Instrument"
          ? ""
          : (row.notes ?? ""),
  };
}

async function loadEvents() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Schedule service is not configured");

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("family_schedule_events")
    .select("id,child,day,title,start_time,end_time,kind,notes")
    .order("day");
  if (error) throw error;

  const events = (data ?? [])
    .filter((row) => row.id !== "leon-cello-mon")
    .map(normalizeRow);
  return {
    dataSource: "supabase",
    events: updateLeonMusic([
    ...events,
    ...[...NEW_LEON_ACTIVITIES, ...NEW_MINA_ACTIVITIES].filter(
      (addition) => !events.some((event) => event.id === addition.id),
    ),
    ]),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!validToken(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    let dataSource = "supabase";
    let warning: string | undefined;
    let events: ScheduleEvent[];
    try {
      const loaded = await loadEvents();
      dataSource = loaded.dataSource;
      events = loaded.events;
    } catch (error) {
      // The existing shared page already uses this model when Supabase is not
      // provisioned. Keep the TV useful, but make the degraded source explicit
      // so it can show an offline/stale indicator instead of pretending this is
      // a live database response.
      console.warn("TV family schedule using model fallback", error);
      dataSource = "schedule-model-fallback";
      warning = "Supabase schedule storage is not provisioned";
      events = updateLeonMusic(DEFAULT_EVENTS);
    }
    return NextResponse.json(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        timezone: "Europe/Bucharest",
        dataSource,
        warning,
        events: events.map((event) => ({
          id: event.id,
          person: event.child,
          title: event.title,
          start: event.start,
          end: event.end,
          day: event.day,
          category: event.kind,
          source: "family_schedule",
          notes: event.notes,
          date: event.date ?? null,
          recurring: !event.date,
          allDay: false,
        })),
        holidays: HOLIDAYS,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=900",
        },
      },
    );
  } catch (error) {
    console.error("TV family schedule API failed", error);
    return NextResponse.json({ error: "Schedule temporarily unavailable" }, { status: 503 });
  }
}
