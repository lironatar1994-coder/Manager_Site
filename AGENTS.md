# Agent Handoff Guide

Read this before changing the Manager Site repo.

## Product Goal

Manager Site is a protected website manager for client websites. Admin users create client accounts, assign each client a website, set permissions, and review client image changes. Clients log in with admin-provided credentials and manage the images and link for their own website only.

There is no public registration.

## Current Production Shape

- GitHub repo: `https://github.com/lironatar1994-coder/Manager_Site.git`
- Local workspace: `C:\Users\liron\Sites_Manager`
- Production directory: `/root/Manager_Site`
- Public URL: `https://vee-app.co.il/Manager_Site/login`
- Lowercase alias: `/manager_site/...` redirects to `/Manager_Site/...`
- PM2 process: `manager-site`
- Node port: `3027`
- Production data path: `/root/Manager_Site/data`
- First production admin password file: `/root/Manager_Site/data/initial-admin.txt`

## Non-Negotiable Behavior

- Keep authentication protected. Do not add public registration unless the user explicitly changes the product direction.
- Keep backend client route as `/client/:username`. The user clarified Hebrew/RTL was for UI text, not backend routing.
- Login and client screens are Hebrew and RTL.
- Admin screen is currently English and LTR.
- Usernames, URLs, and route examples should remain LTR even inside Hebrew UI.
- Client users must only see their own assigned website.
- Client workspace starts with a managed live preview, including desktop/mobile toggle and editable markers for all image slots.
- Admin users can preview client workspaces and manage users, permissions, statuses, and client sites.

## Main Files

- `server.js` - Express app, auth, sessions, APIs, data store, upload handling.
- `public/app.js` - SPA routing, login/admin/client views, UI text, API calls.
- `public/styles.css` - visual design, RTL rules, desktop/mobile responsive layout.
- `public/index.html` - app shell and browser title.
- `deploy.ps1` - Windows deploy entrypoint.
- `deploy_linux.sh` - remote Linux deployment, PM2, Nginx route snippet, production env setup.
- `scripts/hash-password.js` - helper for production admin password hash.
- `clients/<username>/AGENTS.md` - human notes for a specific client website.
- `clients/<username>/client.config.json` - machine-readable allowlist for real production image paths.

## Safe Verification

Run this after JS or server changes:

```powershell
npm.cmd run check
```

For UI changes, also render mobile and desktop. Previous work used Playwright at `390px`, `360px`, and desktop widths to check:

- no horizontal overflow
- Hebrew login/client text renders correctly
- client upload workflow appears before the large preview on mobile
- live route returns `200`

## Deployment

Preferred Windows entrypoint:

```powershell
.\deploy.ps1 "Describe the change"
```

Direct production deploy command used successfully:

```powershell
ssh root@vee-app.co.il "cd /root/Manager_Site && git fetch origin main && git reset --hard origin/main && chmod +x deploy_linux.sh && ./deploy_linux.sh"
```

After deploying, verify:

```powershell
curl.exe -I https://vee-app.co.il/Manager_Site/login
```

## Important Editing Notes

- Use UTF-8-safe inspection for Hebrew strings. Some PowerShell output may display Hebrew as mojibake even when the file is valid.
- Prefer small patches anchored on stable ASCII/function names when editing Hebrew-heavy sections.
- Do not commit `data/`, uploaded images, local test data, or production secrets.
- Do not reset or remove production data during deploy.
- Do not let clients choose arbitrary production paths. Only use `client.config.json` allowlisted paths.
- Real production asset replacement must back up the old file before writing.

## More Docs

- `docs/PRODUCT_GOAL.md`
- `docs/TECHNICAL_SUMMARY.md`
- `docs/UI_UX_GUIDE.md`
- `docs/DEPLOYMENT_AND_OPERATIONS.md`
- `docs/FUTURE_WORK.md`
