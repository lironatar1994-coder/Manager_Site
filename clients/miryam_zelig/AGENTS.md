# Miryam Zelig Client Agent File

This file documents Miryam Zelig's website workspace for future agents.

## Client

- Username: `miryam_zelig`
- Display name: Miryam Zelig
- Manager route: `/client/miryam_zelig`
- Public URL: `https://example.com/miryam-zelig`

## Website Goal

Miryam's website should be manageable through Manager Site. The client should be able to review the current desktop/mobile preview and replace only the image areas listed in `client.config.json`.

## Production Location

- Server: `vee-app.co.il`
- Site root: `/root/client-sites/miryam_zelig`
- Main image folder: `/root/client-sites/miryam_zelig/public/images`

The runtime production workspace has been created on `vee-app.co.il` with starter SVG assets. Update `client.config.json` when the real production website images are ready to replace these starter files.

## Editable Assets

The editable image allowlist is in `client.config.json`.

Current slots:

- Hero image
- Logo
- About section image
- Service image
- Gallery image

## Agent Notes

- Keep `/client/miryam_zelig` as the backend route.
- The UI is Hebrew RTL, but filesystem paths and URLs remain LTR.
- Do not allow arbitrary file replacement outside the configured site root.
- Backups are written beside production images under `.manager-site-backups`.
