# Product Goal

Manager Site is a private control system for managing client website assets.

The business need is simple: a production server hosts or manages many different client websites. Each client should be able to log in to a clean, professional workspace and update the images and link for their own website without seeing other clients or needing admin access.

## Primary Users

### Admin

The admin is responsible for:

- creating client users
- giving each client credentials
- assigning each client to a website
- controlling permissions
- previewing what the client sees
- marking a site as published or needing attention

### Client

The client is responsible for:

- logging in with credentials from the admin
- seeing only their own website workspace
- reviewing a managed desktop/mobile preview of the website
- changing the website link if permitted
- uploading, replacing, or removing images if permitted

## Core Product Rules

- No public registration.
- Admin creates every user.
- Every client account maps to one specific website workspace.
- Client users must not access other clients' routes or assets.
- Image areas are structured, not generic file dumping.
- Client-facing UI should feel premium, minimal, fast, and simple.
- Login and client-facing screens are Hebrew and RTL.
- Backend routes remain stable English routes, especially `/client/:username`.
- The first client workspace section should be client-safe and must not expose internal review/status/approval wording.
- The client workspace should show a live desktop/mobile preview of the configured public website when the website allows framing.

## Website Live Preview

Each reachable live client website should:

- return the real public website URL configured for the client
- allow Manager Site to display it in an iframe
- support desktop/mobile preview sizing inside the Manager Site client workspace

## Current Client Image Slots

- Hero image
- Logo
- About section
- Service image
- Gallery

The Hebrew UI maps these to client-friendly Hebrew labels.

The managed preview should expose all five slots as editable markers so the client can understand which images can be added, replaced, or removed.

## Current Site Status Flow

- Draft
- Published
- Needs attention

The old "waiting review" flow was removed. Image changes are tracked through activity and private admin notes, not a client-facing approval queue.

## Current Production URL

`https://vee-app.co.il/Manager_Site/login`

Use this as the canonical public URL unless the user explicitly changes the deployment target.
