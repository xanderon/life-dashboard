import { NextResponse } from 'next/server';
import {
  getSprintPulseAdminClient,
  getSprintSummary,
  listSprints,
  resetSprint,
  sortAdhocTasks,
} from '@/lib/sprintpulse';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { sprintId?: string } | null;
    if (!body?.sprintId) {
      return NextResponse.json({ error: 'Missing sprintId.' }, { status: 400 });
    }

    const client = getSprintPulseAdminClient();
    await resetSprint(client, body.sprintId);

    const [summaryPayload, sprints] = await Promise.all([
      getSprintSummary(client, body.sprintId),
      listSprints(client),
    ]);

    const sprint = sprints.find((row) => row.id === body.sprintId) ?? null;

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
