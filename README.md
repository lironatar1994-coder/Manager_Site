# Manager Site

Protected website manager for admin-created client accounts. There is no public registration.

## Agent Documentation

Future agents should start with:

- [AGENTS.md](AGENTS.md) - read-first handoff guide.
- [docs/PRODUCT_GOAL.md](docs/PRODUCT_GOAL.md) - product purpose and user roles.
- [docs/TECHNICAL_SUMMARY.md](docs/TECHNICAL_SUMMARY.md) - architecture, routing, APIs, and data model.
- [docs/UI_UX_GUIDE.md](docs/UI_UX_GUIDE.md) - Hebrew/RTL, mobile, and visual rules.
- [docs/DEPLOYMENT_AND_OPERATIONS.md](docs/DEPLOYMENT_AND_OPERATIONS.md) - production deploy and verification.
- [docs/FUTURE_WORK.md](docs/FUTURE_WORK.md) - next improvements and things not to do without approval.

## What Is Built

- `/login` - secured login screen.
- `/admin` - admin-only route for creating users, assigning a website, and controlling permissions.
- `/client/:username` - client route for that user's website.
- Server-side sessions with `HttpOnly` cookies.
- Passwords stored with Node `crypto.scrypt` hashes, never plaintext.
- Per-user permissions for upload, delete, edit website link, and publish.
- Image upload/delete APIs scoped to the assigned website.
- Defined image slots: hero, logo, about, service, and gallery.
- Client website preview composed from assigned image slots.
- Site status flow: draft, waiting review, published, needs attention.
- Admin preview links for checking each client workspace.
- Confirmation modal before removing images.

Local development also seeds a demo client:

- username: `miryam_zelig`
- password: `ChangeMe!2026`

Production does not seed demo clients. Admin creates real users from `/admin`.

The first admin account is created on first startup. In production, the deploy script creates a random admin password and stores it once at:

`/root/Manager_Site/data/initial-admin.txt`

## Local Run

```powershell
npm install
npm run dev
```

Open:

`http://127.0.0.1:3027/login`

For local development you can set your own first admin password:

```powershell
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="change-this-local-password"
npm run dev
```

## Production Security Notes

- Keep `NODE_ENV=production`.
- Keep `SESSION_SECRET` out of git if added later for cross-process session storage.
- Keep `data/` private. It contains users, hashes, audit logs, and uploads.
- Do not allow client-side registration.
- Admin should create each user and send credentials privately.
- Put the app behind HTTPS through Nginx.

## Deployment

The deploy scripts are configured for:

- GitHub repo: `https://github.com/lironatar1994-coder/Manager_Site.git`
- Remote directory: `/root/Manager_Site`
- Public route: `https://vee-app.co.il/Manager_Site/`
- Local Node port on server: `3027`
- PM2 process name: `manager-site`

Run from Windows:

```powershell
.\deploy.ps1 "Deploy Manager Site"
```
