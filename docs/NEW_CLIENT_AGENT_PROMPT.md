# Prompt For Future Agents

Copy this when assigning a new client setup task to an AI agent.

```text
Read `docs/NEW_CLIENT_AGENT_WORKFLOW.md` first and follow it exactly.

New Manager Site client:
- Username: <username>
- Display name: <display name>
- Live website URL: <live website URL>

Your job:
1. Inspect the live website and production files.
2. Create or update `data/clients/<username>/AGENTS.md`.
3. Create or update `data/clients/<username>/client.config.json` with every editable image slot.
4. Use clear Hebrew labels for client-visible image areas.
5. Verify the live public website can load inside the Manager Site desktop/mobile iframe preview. Do not install Playwright or Chromium for this.
6. If you also need a committed fallback/template, mirror the config under `clients/<username>/client.config.json`.
7. Verify through the Manager Site API that all slots appear and existing files are detected.
8. Verify the client UI route, including that the first section is client-safe and the live desktop/mobile preview loads.
9. Commit, push, and deploy only when the setup is verified.

Do not ask me to explain the whole system again. The workflow file is the source of truth.
```
