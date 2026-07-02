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

If the user only gives a URL and a username, infer the rest carefully from the website and confirm only if uncertain.

## What To Build

For each new client, create or update:

- `clients/<username>/AGENTS.md`
- `clients/<username>/client.config.json`
- Production copy at `/root/Manager_Site/data/clients/<username>/client.config.json` when deploying live

The `client.config.json` file is the machine-readable allowlist. Manager Site can only view, replace, remove, or reorder images that are listed there.

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

5. Write the client agent file.

   `clients/<username>/AGENTS.md` should explain:

   - client identity
   - public URL
   - production paths
   - what the website is supposed to achieve
   - which image sections are editable
   - important client-specific notes
   - deployment or verification notes

6. Sync production config.

   After committing and deploying the repo, Manager Site may still prefer the runtime config under `data/clients`.

   Sync it explicitly:

   ```bash
   mkdir -p /root/Manager_Site/data/clients/<username>
   cp /root/Manager_Site/clients/<username>/client.config.json /root/Manager_Site/data/clients/<username>/client.config.json
   chmod 600 /root/Manager_Site/data/clients/<username>/client.config.json
   ```

7. Verify through Manager Site API.

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

8. Verify UI behavior.

   Open:

   - `https://vee-app.co.il/Manager_Site/admin-login`
   - `https://vee-app.co.il/Manager_Site/client/<username>`

   Check:

   - Hebrew/RTL client UI
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

- client files exist in `clients/<username>/`
- runtime production config is synced when live
- Manager Site API returns the expected slots
- live UI shows those slots
- uploads/replacements affect the intended live website files
- changes are committed and pushed
