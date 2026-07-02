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
2. Create or update `clients/<username>/AGENTS.md`.
3. Create or update `clients/<username>/client.config.json` with every editable image slot.
4. Use clear Hebrew labels for client-visible image areas.
5. Sync the runtime production config if working on the live server.
6. Verify through the Manager Site API that all slots appear and existing files are detected.
7. Verify the client UI route.
8. Commit, push, and deploy only when the setup is verified.

Do not ask me to explain the whole system again. The workflow file is the source of truth.
```
