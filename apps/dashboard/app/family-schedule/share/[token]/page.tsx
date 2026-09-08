import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import {
  FamilySchedule,
  NEW_LEON_ACTIVITIES,
  type ScheduleEvent,
} from "../../FamilySchedule";

export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

const SHARE_TOKEN_HASH =
  "a8728c803e339c76e1aed439ca71dbad49fbe1266d16585fd162c3f9a5766e55";

function validToken(token: string) {
  if (token.length < 32 || token.length > 128) return false;
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"));
  const expected = Buffer.from(SHARE_TOKEN_HASH);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function loadEvents(): Promise<ScheduleEvent[] | undefined> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return undefined;
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("family_schedule_events")
    .select("id,child,day,title,start_time,end_time,kind,notes")
    .order("day");
  if (error || !data?.length) return undefined;
  const events = data.map((row) => ({
    id: row.id,
    child: row.child as ScheduleEvent["child"],
    day: row.day,
    title: row.title,
    start:
      row.id === "leon-music-theory-mon" &&
      row.start_time.slice(0, 5) === "17:00" &&
      row.end_time.slice(0, 5) === "18:00"
        ? "16:00"
        : row.id === "leon-cello-wed"
          ? "14:30"
          : row.id === "leon-music-theory-wed"
            ? "16:00"
            : row.start_time.slice(0, 5),
    end:
      row.id === "leon-music-theory-mon" &&
      row.start_time.slice(0, 5) === "17:00" &&
      row.end_time.slice(0, 5) === "18:00"
        ? "17:00"
        : row.id === "leon-cello-wed"
          ? "16:00"
          : row.id === "leon-music-theory-wed"
            ? "17:00"
            : row.end_time.slice(0, 5),
    kind: row.kind as ScheduleEvent["kind"],
    notes:
      row.id === "leon-cello-wed" && row.notes === "Instrument"
        ? ""
        : (row.notes ?? ""),
  }));
  return [
    ...events,
    ...NEW_LEON_ACTIVITIES.filter(
      (addition) => !events.some((event) => event.id === addition.id),
    ),
  ];
}

export default async function SharedFamilySchedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!validToken(token)) notFound();
  return <FamilySchedule readOnly initialEvents={await loadEvents()} />;
}
