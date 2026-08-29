# Pinhas Ratzon Client Agent File

## Client

- Username: `pinhas_ratzon`
- Display name: פנחס רצון
- Manager route: `/client/pinhas_ratzon`
- Public URL: `https://pinhasratzon.co.il/`

## Website Goal

The site presents attorney Pinhas Ratzon's real-estate, taxation, registration, wills, inheritance, enduring-power-of-attorney, and receivership services. Keep the client editor structured and low risk: visible marketing copy and named photography are editable; legal credentials, SEO metadata, schema, navigation, and practice-area legal detail are not free-form CMS fields.

## Production Location

- Server: `vee-app.co.il`
- Source repo: `/root/PinhasRatzon`
- Public web root: `/var/www/PinhasRatzon-domain`
- Main image folder: `/var/www/PinhasRatzon-domain/assets/img`
- Canonical domain: `https://pinhasratzon.co.il/`

## Editable Content

The allowlist is `client.config.json`. It exposes 15 named JPG image slots and 13 plain-text slots across the opening, main content, About, FAQ, and Contact groups.

- Image uploads for these slots must be JPG. Manager Site rejects a file whose actual MIME type does not match the configured `.jpg` target.
- Text fields are plain text only. Every configured marker must appear exactly once in its generated HTML file.
- Preserve every `data-manager-text` marker in `site/src/pages.mjs` when changing page templates.
- Do not expose legal credentials, structured data, metadata, practice-area legal explanations, phone numbers, or email addresses as casual CMS text fields without explicit approval.

## Deployment Preservation

The website is generated from `site/src` and deployed by swapping a new static root into place. Before the swap, `site/apply-manager-content.mjs` overlays the current live managed images, text values, and image cache-busting query versions onto the staged build using the runtime config at `/root/Manager_Site/data/clients/pinhas_ratzon/client.config.json`.

Do not remove that overlay step. Without it, a normal website deployment would replace client-edited content with Git defaults.

## Live Preview

The public site allows framing only by itself and `https://vee-app.co.il` through CSP `frame-ancestors`; do not restore `X-Frame-Options: SAMEORIGIN` on HTML responses because it blocks the Manager Site preview.

## Verification

- Run the Pinhas site build, check, and gates.
- Confirm all configured text markers appear once in the generated files.
- Confirm every configured image exists and is referenced by its exact `.jpg` public path.
- Confirm `https://pinhasratzon.co.il/` returns `200` and permits framing from `https://vee-app.co.il`.
- Verify Manager Site reports the config as active, all 15 images as existing, and all 13 text slots as editable.
- Test a reversible text edit and image replacement through the client API, then restore both and confirm the public site updates.
