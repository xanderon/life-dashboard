# Study Coach Trainer Mode

## API key

Set `OPENAI_API_KEY` in:

`/Users/xan/Documents/Github repos/life-dashboard/.env`

Example:

```bash
OPENAI_API_KEY=sk-...
```

If missing, trainer feedback falls back to local heuristic mode.

## Route

- UI: `/study-coach/trainer`
- API: `/api/study-coach/trainer-feedback`
- API chat: `/api/study-coach/trainer-chat`
