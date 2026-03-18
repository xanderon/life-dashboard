# Study Coach Trainer Mode (Algorithms Focus)

## API key

Set `OPENAI_API_KEY` in:

`/Users/xan/Documents/Github repos/life-dashboard/.env`

Example:

```bash
OPENAI_API_KEY=sk-...
```

If missing, chat + feedback fall back to local heuristic mode.

## Route

- UI: `/study-coach/trainer`
- API feedback: `/api/study-coach/trainer-feedback`
- API chat: `/api/study-coach/trainer-chat`

## What this mode does

- Full roadmap on algorithm categories (Array, Binary Search, Stack, Linked List, Binary Tree, Queue, Recursion, Matrix)
- Checklist per problem: `todo / in_progress / done`
- Per-problem metadata: `difficulty`, `docsUrl`, `solutionPath`, `notes`
- AI coach actions on `problemId` (focus/mark/meta update)
- Theory is kept in a separate collapsible section to keep planner focus on problems
