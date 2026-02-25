import { NextRequest, NextResponse } from 'next/server';
import {
  getCurrentSprint,
  getSprintPulseAdminClient,
  getSprintSummary,
} from '@/lib/sprintpulse';

export async function GET(request: NextRequest) {
  try {
    const client = getSprintPulseAdminClient();
    const sprintId = request.nextUrl.searchParams.get('sprintId');

    let resolvedSprintId = sprintId;
    if (!resolvedSprintId) {
      const sprint = await getCurrentSprint(client);
      if (!sprint) {
        return NextResponse.json({ error: 'No sprint found.' }, { status: 404 });
      }
      resolvedSprintId = sprint.id;
    }

    const payload = await getSprintSummary(client, resolvedSprintId);
    return NextResponse.json({ ok: true, sprintId: resolvedSprintId, ...payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
