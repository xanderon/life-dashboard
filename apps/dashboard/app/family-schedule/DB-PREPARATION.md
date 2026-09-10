# Calendar data transition (not activated)

Backup: branch codex/calendar-backup-2026-09-10.

schedule-data.ts owns the current seed timetable and activities.
schedule-model.ts owns the shared event type, date matching and overlap layout.
ScheduleRepository defines load/save/remove for a future adapter; it is deliberately
not wired up. The existing activity Supabase path and local school editing remain.
No database schema or data migration is executed by this preparation.

Before switching:
- Store both lessons and activities per owner, with nullable event date for one-offs.
- Apply initial seeds once, with a versioned migration; remove per-load ID overrides
  and missing-event reinsertion so edits and deletions remain authoritative.
- Move legacy local edits into the owner's records only after reconciliation.
- Filter shared reads by the token's owner; keep writes authenticated.
- Make reset transactional and report write/delete failures rather than silently
  reporting cloud success.
- Share identical recurrence/holiday logic between day, week and month.
- Confirm school bell times separately: they are configured assumptions, not
  provided in the timetable photo.

The one-off meeting's date is now represented in the model. Legacy database rows
still use the date inferred from its known ID until a date column is introduced.
