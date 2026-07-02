# Miriam Zelig Client Agent File

This file documents Miriam Zelig's website workspace for future agents.

## Client

- Username: `miriam_zelig`
- Display name: Miriam Zelig
- Manager route: `/client/miriam_zelig`
- Public URL: `https://example.com/miriam-zelig`

## Website Goal

Miriam's website should be manageable through Manager Site. The client should be able to review the current desktop/mobile preview and replace only the image areas listed in `client.config.json`.

## Production Location

- Server: `vee-app.co.il`
- Site root: `/root/client-sites/miriam_zelig`
- Main image folder: `/root/client-sites/miriam_zelig/public/images`

The paths above are starter paths. Update `client.config.json` when the real production website folder is known.

## Editable Assets

The editable image allowlist is in `client.config.json`.

Current slots:

- Hero image
- Logo
- About section image
- Service image
- Gallery image

## Agent Notes

- Keep `/client/miriam_zelig` as the backend route.
- The UI is Hebrew RTL, but filesystem paths and URLs remain LTR.
- Do not allow arbitrary file replacement outside the configured site root.
- Backups are written beside production images under `.manager-site-backups`.
