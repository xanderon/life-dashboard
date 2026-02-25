import { NextResponse } from 'next/server';
import {
  getSprintPulseAdminClient,
  getSprintSummary,
  listSprints,
  sortAdhocTasks,
  startSprint,
  type StartSprintPayload,
} from '@/lib/sprintpulse';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as StartSprintPayload | null;
    const client = getSprintPulseAdminClient();

    const sprint = await startSprint(client, body ?? {});
    const [summaryPayload, sprints] = await Promise.all([
      getSprintSummary(client, sprint.id),
      listSprints(client),
    ]);

    return NextResponse.json({
      ok: true,
      sprint,
      sprints,
      recurring: summaryPayload.recurring,
      adhoc: sortAdhocTasks(summaryPayload.adhoc),
      summary: summaryPayload.summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
