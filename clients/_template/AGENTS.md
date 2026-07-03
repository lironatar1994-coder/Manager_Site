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
- whether the live site references it from HTML, CSS `url(...)`, generated markup, or a CDN
- how the public reference is cache-busted after replacement

Example:

| Slot ID | Hebrew label | Production file | Website section |
| --- | --- | --- | --- |
| `hero` | `תמונת פתיחה` | `/var/www/example/images/hero.jpg` | hero |
| `before_after_before` | `לפני - לפני ואחרי` | `/var/www/example/images/before.jpg` | before/after |
| `before_after_after` | `אחרי - לפני ואחרי` | `/var/www/example/images/after.jpg` | before/after |

## Live Preview

The Manager Site client workspace uses the configured public URL as a live iframe preview with desktop/mobile sizing controls.

Verify the public URL returns a normal page and does not send headers that block framing. Do not add static screenshot files, Playwright, or Chromium just for the preview.

## Replacement Visibility

After replacing a production image, verify the public website itself shows the new file. Do not trust Manager Site thumbnails alone.

Checklist:

- the `currentPath` file changed on disk
- the live page HTML/CSS references the same `publicPath`
- static references are cache-busted with `?v=<timestamp>` or another site-specific cache clear
- before/after sections are checked for both `before` and `after` images
- CSS background images and lazy-loaded image attributes are checked separately

## Agent Notes

- Do not add public registration.
- Do not let clients choose arbitrary file paths.
- Back up files before replacing production assets.
- Verify public cache-busting after replacements so clients do not keep seeing stale images.
- Keep usernames, URLs, and filesystem paths LTR in Hebrew UI.
