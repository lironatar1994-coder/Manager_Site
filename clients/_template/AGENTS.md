# Client Agent File Template

Use this file to document one client's website for future agents.

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

## Agent Notes

- Do not add public registration.
- Do not let clients choose arbitrary file paths.
- Back up files before replacing production assets.
- Keep usernames, URLs, and filesystem paths LTR in Hebrew UI.
