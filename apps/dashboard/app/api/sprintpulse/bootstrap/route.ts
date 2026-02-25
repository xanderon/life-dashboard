import { NextRequest, NextResponse } from 'next/server';
import {
  ensureDefaultTemplates,
  getSprintPulseAdminClient,
  getSprintSummary,
  getTemplates,
  listSprints,
  sortAdhocTasks,
  startSprint,
} from '@/lib/sprintpulse';

export async function GET(request: NextRequest) {
  try {
    const client = getSprintPulseAdminClient();
    await ensureDefaultTemplates(client);

    const sprints = await listSprints(client);
    let currentSprint = sprints[0] ?? null;

    if (!currentSprint) {
      currentSprint = await startSprint(client, { carryOverMode: 'keep_old' });
    }

    const querySprintId = request.nextUrl.searchParams.get('sprintId');
    const selectedSprint =
      (querySprintId ? sprints.find((sprint) => sprint.id === querySprintId) : null) ?? currentSprint;

    const [templates, summaryPayload] = await Promise.all([
      getTemplates(client),
      getSprintSummary(client, selectedSprint.id),
    ]);

    return NextResponse.json({
      ok: true,
      sprints,
      currentSprint,
      selectedSprint,
      templates,
      recurring: summaryPayload.recurring,
      adhoc: sortAdhocTasks(summaryPayload.adhoc),
      summary: summaryPayload.summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
