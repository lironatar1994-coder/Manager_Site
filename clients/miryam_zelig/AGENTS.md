# Miryam Zelig Client Agent File

This file documents Miryam Zelig's website workspace for future agents.

## Client

- Username: `miryam_zelig`
- Display name: Miryam Zelig
- Manager route: `/client/miryam_zelig`
- Public URL: `https://vee-app.co.il/Miryam_Zelig/`

## Website Goal

Miryam's website should be manageable through Manager Site. The client should be able to review the current desktop/mobile preview and replace only the image areas listed in `client.config.json`.

## Production Location

- Server: `vee-app.co.il`
- Source repo on server: `/root/Miryam_Zelig`
- Public web root: `/var/www/Miryam_Zelig`
- Main image folder: `/var/www/Miryam_Zelig/gallery`
- Portrait image: `/var/www/Miryam_Zelig/miryam.jpeg`

The real website originally referenced remote Netlify image URLs. The site has been converted to serve local image files from `/var/www/Miryam_Zelig` so Manager Site can replace the live production images safely.

## Editable Assets

The editable image allowlist is in `client.config.json`.

Current slots:

- Hero image: `gallery/img1.jpeg`
- Gallery images: `gallery/img2.jpeg` through `gallery/img8.jpeg`
- About portrait: `miryam.jpeg`

## Preview Screenshots

The Manager Site client workspace uses saved first-viewport screenshots:

- Desktop: `public/client-previews/miryam_zelig/desktop.png`
- Mobile: `public/client-previews/miryam_zelig/mobile.png`

These were captured from `https://vee-app.co.il/Miryam_Zelig/` and should be refreshed when the website design or first viewport changes.

## Agent Notes

- Keep `/client/miryam_zelig` as the backend route.
- The UI is Hebrew RTL, but filesystem paths and URLs remain LTR.
- Do not allow arbitrary file replacement outside the configured site root.
- Backups are written beside production images under `.manager-site-backups`.
- Manager Site writes directly to `/var/www/Miryam_Zelig`, so image replacements are visible on the live website immediately.
