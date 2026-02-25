import { NextResponse } from 'next/server';
import {
  computeReminderHits,
  getCurrentSprint,
  getSprintInstances,
  getSprintPulseAdminClient,
  getTemplates,
} from '@/lib/sprintpulse';

export async function POST() {
  try {
    const client = getSprintPulseAdminClient();
    const sprint = await getCurrentSprint(client);

    if (!sprint) {
      return NextResponse.json({ ok: true, reminders: [], message: 'No active sprint.' });
    }

    const [templates, instances] = await Promise.all([
      getTemplates(client),
      getSprintInstances(client, sprint.id),
    ]);

    const reminders = computeReminderHits(sprint, templates, instances);

    return NextResponse.json({
      ok: true,
      sprint,
      dayOfSprint: reminders[0]?.dayOfSprint ?? null,
      reminders,
      count: reminders.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
