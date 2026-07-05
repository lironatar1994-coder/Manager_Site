# Miryam Zelig Client Agent File

This file documents Miryam Zelig's website workspace for future agents.

## Client

- Username: `miryam_zelig`
- Display name: Miryam Zelig
- Manager route: `/client/miryam_zelig`
- Public URL: `https://vee-app.co.il/Miryam_Zelig/`

## Website Goal

Miryam's website should be manageable through Manager Site. The client should be able to review the current live desktop/mobile preview and replace only the image areas listed in `client.config.json`.

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
- Before/after before image: `gallery/before-after-before.jpeg`
- Before/after after image: `gallery/before-after-after.jpeg`
- About portrait: `miryam.jpeg`

Editable text is controlled through `textSlots` in `client.config.json`.

Current text slots:

- About: `about.title`, `about.body`
- FAQ questions and answers: `faq.1.question` through `faq.5.answer`

Important: editable website text must keep its `data-manager-text="<slot-id>"` marker in both `/root/Miryam_Zelig/index.html` and `/var/www/Miryam_Zelig/index.html`. If you redesign or move About/FAQ content, move the marker with the exact visible element. Do not remove or duplicate these markers, because Manager Site requires exactly one marker per text slot before it will save.

Important: the public hero image must reference `/Miryam_Zelig/gallery/img1.jpeg?v=<timestamp>`. Do not point the visible hero photo at `gallery/hero.jpeg`; Manager Site replaces `gallery/img1.jpeg`, so using another hero filename makes the hero appear unchangeable even though the upload succeeds.

Important: the public gallery can still use `gallery/img2.jpeg` and `gallery/img3.jpeg`, but the before/after slider must not use those gallery files. The slider HTML must reference:

- `/Miryam_Zelig/gallery/before-after-before.jpeg?v=<timestamp>`
- `/Miryam_Zelig/gallery/before-after-after.jpeg?v=<timestamp>`

If a future website edit reconnects the before/after slider to `gallery/img2.jpeg` or `gallery/img3.jpeg`, Manager Site will appear to replace the image successfully in admin while the live before/after section will not change.

## Live Preview

The Manager Site client workspace uses the live public URL as an iframe preview:

- `https://vee-app.co.il/Miryam_Zelig/`

Desktop/mobile buttons resize the Manager Site preview frame. Do not add static screenshots, Playwright, or Chromium for this preview.

## Replacement Visibility

Miryam's public site is static HTML under `/var/www/Miryam_Zelig/index.html`.

Miryam's website deploy must preserve Manager Site managed images. The website source repo may contain default image files, but after a client changes images through Manager Site, the live files under `/var/www/Miryam_Zelig` are the source of truth for the editable slots. Do not deploy Miryam's website with a script that deletes the web root and blindly copies `gallery`/`miryam.jpeg` from Git without first preserving and restoring the Manager-managed assets.

After replacing any production image, especially the `before_after_before` and `before_after_after` slots, verify:

- the target file changed on disk under `/var/www/Miryam_Zelig`
- `index.html` references the same public path from `client.config.json`
- the reference has a fresh `?v=<timestamp>` query so browser/Nginx cache does not keep the old image
- the public URL `https://vee-app.co.il/Miryam_Zelig/` shows the new image, not only Manager Site

For the before/after section, also grep both source and public HTML before closing the task:

```bash
grep -n 'ba-before\|ba-after\|before-after-before\|before-after-after\|gallery/img2\|gallery/img3' /root/Miryam_Zelig/index.html /var/www/Miryam_Zelig/index.html
```

Expected result: normal gallery frames may reference `gallery/img2.jpeg` and `gallery/img3.jpeg`; `.ba-before` and `.ba-after` must reference the dedicated `before-after-*` files.

After replacing any production text, verify:

- `/var/www/Miryam_Zelig/index.html` contains the new visible Hebrew text
- the matching `data-manager-text` marker still exists exactly once
- the public URL `https://vee-app.co.il/Miryam_Zelig/` shows the new text after refresh

## Agent Notes

- Keep `/client/miryam_zelig` as the backend route.
- The UI is Hebrew RTL, but filesystem paths and URLs remain LTR.
- Do not allow arbitrary file replacement outside the configured site root.
- Backups are written beside production images under `.manager-site-backups`.
- Manager Site writes directly to `/var/www/Miryam_Zelig`; live visibility also depends on public HTML/cache-busted references.
