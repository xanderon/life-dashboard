# Tratament - Afectiune disc cervical 2026

## Overview
- Page route: `/apps/tratament-cervical-2026`
- Persists checkmarks in Supabase, per user and per plan.
- Plan key used in DB: `cervical-2026`

## Database
Table used: `treatment_checkmarks`

Required columns:
- `user_id` (uuid, FK to `auth.users`)
- `plan_key` (text)
- `item_key` (text)
- `checked` (boolean)

RLS should allow users to read/write only their own rows.

## How it works
- On load: reads rows from `treatment_checkmarks` for current user + `plan_key`.
- On toggle: upserts one row per checkbox using `item_key`.
- Refresh: state is restored from DB.

## Cleanup after treatment
If you want to remove only the checkmarks for this plan:

```sql
delete from treatment_checkmarks
where plan_key = 'cervical-2026';
```

If you want to remove the app card as well:

```sql
delete from apps
where slug = 'tratament-cervical-2026';
```

If you will not use treatment checkmarks at all (no other plans):

```sql
drop table if exists treatment_checkmarks;
```
