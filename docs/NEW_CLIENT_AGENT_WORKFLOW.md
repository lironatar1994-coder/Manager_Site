# New Client Agent Workflow

Read this file when the user says something like:

> I created a new client user. Here is the live website link. Set it up in Manager Site.

The goal is to make a new client website manageable from Manager Site with minimal repeated explanation from the user.

## Required Inputs

Ask only for missing information that cannot be discovered safely.

- Manager Site username, for example `liron`
- Client display name, for example `Liron Cohen`
- Live website URL, for example `https://vee-app.co.il/Liron/`
- Whether the client already exists in Manager Site admin
- If the client exists, check `data/clients/<username>/CLIENT_SUMMARY.md` first for the latest admin-managed display name, website name, route, and public URL.

If the user only gives a URL and a username, infer the rest carefully from the website and confirm only if uncertain.

## What To Build

For each new client, create or update:

- runtime files under `data/clients/<username>/`
- optional repo fallback files under `clients/<username>/` when you want the config committed
- production runtime files under `/root/Manager_Site/data/clients/<username>/`

The `client.config.json` file is the machine-readable allowlist. Manager Site can only view, replace, remove, or reorder images that are listed there.

Manager Site reads runtime config first from `data/clients/<username>/client.config.json`, then falls back to repo config at `clients/<username>/client.config.json`.

The client-facing desktop/mobile preview is a live iframe pointed at the configured public website URL. Do not install Playwright, Chromium, or static screenshot generation just to power Manager Site previews.

## Workflow

1. Inspect the live website.

   Open the live URL and collect:

   - website purpose and audience
   - major visible sections
   - every image used by the page
   - section names that clients will understand in Hebrew
   - whether images are local production files or remote CDN URLs

2. Locate the production source.

   On the production server, identify:

   - public web root, usually `/var/www/<Site_Name>`
   - source repo or working folder, often `/root/<Site_Name>`
   - image folders and actual files used by the live page

   Use commands like:

   ```bash
   find /var/www/<Site_Name> -maxdepth 4 -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' -o -iname '*.gif' -o -iname '*.svg' \) | sort
   grep -RInE '<img|background|url\(' /var/www/<Site_Name> /root/<Site_Name> 2>/dev/null | head -200
   ```

3. Convert remote images if needed.

   If the website uses remote image URLs, Manager Site cannot safely replace those files directly.

   Preferred fix:

   - download or copy the chosen images into the website production folder
   - update the website to reference local files
   - deploy or sync the website
   - then add those local files to `client.config.json`

4. Create clear image slots.

   Each editable image needs one slot:

   ```json
   {
     "id": "before_after_before",
     "labelHe": "לפני - לפני ואחרי",
     "required": false,
     "currentPath": "/var/www/Client_Site/images/before.jpg",
     "publicPath": "/Client_Site/images/before.jpg"
   }
   ```

   Slot rules:

   - `id` must be stable ASCII: lowercase letters, numbers, `_`, or `-`
   - `labelHe` must be client-friendly Hebrew
   - `currentPath` must be an absolute path inside `siteRoot`
   - `publicPath` must be the public browser path for the same file
   - never add arbitrary paths outside the website root
   - do not reuse vague labels when a section has a specific purpose

5. Create text slots when the client should edit website copy.

   Start with structured, low-risk sections such as About and FAQ. Do not create a free-form page builder.

   Each editable text field needs one stable HTML marker and one `textSlots` entry:

   ```html
   <p data-manager-text="about.body">Current about text...</p>
   ```

   ```json
   {
     "id": "about.body",
     "labelHe": "טקסט אודות",
     "group": "about",
     "required": true,
     "inputType": "long",
     "maxLength": 700,
     "filePath": "/var/www/Client_Site/index.html",
     "marker": "about.body"
   }
   ```

   Text slot rules:

   - `id` and `marker` must be stable ASCII.
   - `filePath` must be an absolute path inside `siteRoot`.
   - the matching `data-manager-text` marker must exist exactly once.
   - clients edit plain text only, not HTML.
   - if a future redesign moves content, move the marker with the visible element.

6. Verify public references and cache busting.

   Do not stop after confirming that `currentPath` exists on disk. You must also prove that the live website actually references the same public file.

   Check the HTML/CSS references:

   ```bash
   grep -RInE '<img|background|url\(|before|after|gallery' /var/www/<Site_Name> /root/<Site_Name> 2>/dev/null | head -200
   ```

   For each configured slot:

   - `currentPath` is the exact file Manager Site will overwrite.
   - `publicPath` is the exact browser path used by the live page, excluding any existing query string.
   - Static HTML references include the same path, or are updated to use it.
   - If the image URL can be cached, the live reference should support or include a query version like `?v=<timestamp>` after replacement.

   Manager Site automatically tries to refresh matching `.html` references under `siteRoot` by changing `publicPath` to `publicPath?v=<timestamp>` after a successful production replacement. Future agents must still verify this behavior for each new client, especially for before/after sections, CSS background images, lazy-loaded images, and any site using generated HTML.

   After a test replacement, verify both the file and the public reference:

   ```bash
   stat -c '%s %y %n' /var/www/<Site_Name>/path/to/image.jpg
   grep -RIn '/Client_Site/path/to/image.jpg' /var/www/<Site_Name>/*.html
   curl -I 'https://vee-app.co.il/Client_Site/path/to/image.jpg?v=<timestamp>'
   ```

7. Write the client agent file.

   `data/clients/<username>/AGENTS.md` should explain:

   - client identity
   - public URL
   - production paths
   - what the website is supposed to achieve
   - which image sections are editable
   - which text sections are editable and which `data-manager-text` markers must be preserved
   - important client-specific notes
   - deployment or verification notes
   - whether public image references are static HTML, CSS `url(...)`, framework-generated assets, or CDN URLs
   - the exact cache-busting rule needed for this website

8. Verify the live desktop/mobile preview.

   The client workspace first section loads the configured public website URL in an iframe and adds a cache-busting `manager_preview` query parameter.

   Verify the live website URL after it is reachable:

   - the URL returns `200`
   - the page is the real client website, not an error page or placeholder
   - response headers do not include `X-Frame-Options: DENY`, `X-Frame-Options: SAMEORIGIN` on a different origin, or a `Content-Security-Policy` `frame-ancestors` rule that blocks Manager Site
   - desktop and mobile preview buttons resize the Manager Site frame
   - the refresh preview button reloads the iframe

   If the live website cannot be framed, do not install Playwright or Chromium as a workaround. Leave a short note in `data/clients/<username>/AGENTS.md` explaining the framing block and fix the website headers if that site is under our control.

8. Sync production config.

   After committing and deploying the repo, Manager Site may still prefer the runtime config under `data/clients`.

   Sync it explicitly:

   ```bash
   mkdir -p /root/Manager_Site/data/clients/<username>
   cp /root/Manager_Site/clients/<username>/client.config.json /root/Manager_Site/data/clients/<username>/client.config.json
   chmod 600 /root/Manager_Site/data/clients/<username>/client.config.json
   ```

9. Verify through Manager Site API.

   Log in as admin and check the assets endpoint:

   ```js
   const base = "https://vee-app.co.il/Manager_Site";
   const login = await fetch(`${base}/api/auth/login`, {
     method: "POST",
     headers: { "content-type": "application/json" },
     body: JSON.stringify({ username: "admin", password: "<admin-password>" })
   });
   const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
   const sites = await (await fetch(`${base}/api/sites`, { headers: { cookie } })).json();
   const site = sites.sites.find((item) => item.ownerUsername === "<username>");
   const assets = await (await fetch(`${base}/api/sites/${site.id}/assets`, { headers: { cookie } })).json();
   console.log(assets.assets.map((asset) => ({
     slotId: asset.slotId,
     label: asset.label,
     exists: asset.exists,
     productionPath: asset.productionPath
   })));
   ```

   Verification must prove:

   - `configured` is `true`
   - all expected slots appear
   - each required slot has `exists: true`
   - paths point to the intended live files

10. Verify UI behavior.

   Open:

   - `https://vee-app.co.il/Manager_Site/admin-login`
   - `https://vee-app.co.il/Manager_Site/client/<username>`

   Check:

   - Hebrew/RTL client UI
   - the first client section is client-safe and does not show internal status/review/approval wording
   - the first client section shows `ניהול תמונות האתר` or similarly clear client-facing wording
   - desktop preview loads the live public URL in the iframe
   - mobile toggle resizes the iframe preview
   - all slots appear under `תמונות להחלפה`
   - upload/replace targets are understandable
   - drag-and-drop works for reorderable existing images
   - refresh on the client route does not get stuck on the `MS` boot screen

## Naming Pattern

Use specific section names, not generic numbering, when the website has a named section.

Good examples:

- `hero`
- `about_portrait`
- `before_after_before`
- `before_after_after`
- `service_makeup_1`
- `gallery_1`

Avoid:

- `image1`
- `newpic`
- `section`
- `test`

## Security Rules

- Never expose production secrets in client files.
- Never allow clients to type arbitrary filesystem paths.
- Never add public registration.
- Never overwrite production images without backup support.
- Never point a slot outside `siteRoot`.
- Treat `client.config.json` as the safety boundary.

## Done Definition

The setup is complete only when:

- runtime client files exist in `data/clients/<username>/`
- optional committed fallback files exist in `clients/<username>/` when needed
- runtime production config is synced when live
- Manager Site API returns the expected slots
- live UI shows those slots and the live desktop/mobile iframe preview
- uploads/replacements affect the intended live website files
- live public page references are cache-busted or otherwise proven to show the new image immediately
- before/after slots, CSS background images, and lazy-loaded images are verified on the actual public URL
- changes are committed and pushed
