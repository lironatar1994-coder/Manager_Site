# Client Agent File Template

Use this file to document one client's website for future agents.

Before onboarding a real client, read:

- `docs/NEW_CLIENT_AGENT_WORKFLOW.md`

## Client

- Username: `replace_username`
- Display name: Replace Client Name
- Manager route: `/client/replace_username`
- Public URL: `https://example.com`

## Website Goal

Describe what the client website is meant to do, who it serves, and which sections matter most.

## Production Location

- Server: `vee-app.co.il`
- Site root: `/root/client-sites/replace_username`
- Main image folder: `/root/client-sites/replace_username/public/images`

## Editable Assets

The machine-readable allowlist lives in `client.config.json`.

Only paths listed there should be read or replaced by Manager Site.

For each visible website image that should be editable, document:

- slot id from `client.config.json`
- Hebrew label shown to the client
- production file path
- public browser path
- which website section uses it

Example:

| Slot ID | Hebrew label | Production file | Website section |
| --- | --- | --- | --- |
| `hero` | `תמונת פתיחה` | `/var/www/example/images/hero.jpg` | hero |
| `before_after_before` | `לפני - לפני ואחרי` | `/var/www/example/images/before.jpg` | before/after |
| `before_after_after` | `אחרי - לפני ואחרי` | `/var/www/example/images/after.jpg` | before/after |

## Preview Screenshots

The Manager Site client workspace should show real screenshots of this website:

- `public/client-previews/replace_username/desktop.png`
- `public/client-previews/replace_username/mobile.png`

Capture these from the live public URL after the website is reachable. Use the workflow in `docs/NEW_CLIENT_AGENT_WORKFLOW.md`.

## Agent Notes

- Do not add public registration.
- Do not let clients choose arbitrary file paths.
- Back up files before replacing production assets.
- Keep usernames, URLs, and filesystem paths LTR in Hebrew UI.
