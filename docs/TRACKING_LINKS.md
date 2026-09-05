# Tracking links

Clients and admins can open `/client/:username/links` from the studio or visitor workspace. The Hebrew RTL interface supports naming links, descriptions, copying, editing destinations, disabling, archiving and restoring, date filters, search, sorting, comparison, and per-link charts, devices, referrer hosts and edit history. QR codes and downstream conversion tracking are outside this version.

## Access and destinations

- `requireSiteAccess` protects every management/report endpoint. Clients can access only their assigned site; admins can preview any client.
- The separate `canManageTrackingLinks` permission controls creation and editing. It defaults to enabled for existing clients; admins can turn it off in the user editor without removing report access. It does not change `canEditLinks`, which edits the client's website URL.
- Only the public `/r/:code` redirect is unauthenticated. It uses a random 12-character code. It returns an uncached 302 for active links and 410 for disabled/archived links or inactive owners. Unknown codes return 404. Changing the destination keeps the code and history.
- Destinations must share the stored website's origin and be within its path boundary. Encoded path separators/traversals and tracking-link loops are rejected. The incoming request query never overrides or extends the saved destination. If an admin or client changes the stored website URL, old destinations outside the new boundary stop redirecting until updated.

## What is measured

- A click is a GET navigation to the redirect without an identified bot/prefetch signature. This does **not** establish that the destination page loaded.
- Known bot, messaging preview, automation and prefetch signatures are counted separately. Detection is heuristic, not proof of a human. HEAD requests and explicit non-navigation fetch destinations do not increment either count.
- Unique visitors are distinct HMACs of IP addresses, scoped to a site and deduplicated across links in the overview. They are estimates: shared networks and changing addresses affect them. No raw IP, full user agent or full referrer URL is persisted. Referrers are hostnames only; unavailable referrers are shown as direct/unknown.
- The Node app listens on loopback. Production Nginx overwrites `X-Real-IP`; the tracking service trusts that header only from a loopback peer. It deliberately ignores the client-controlled first `X-Forwarded-For` entry. Preserve this proxy setup.
- Calendar-day ranges, filenames and display dates use `Asia/Jerusalem`; event timestamps are UTC. The default range is 30 days, and a query can span at most 366 days. Last-open timestamps and breakdowns use the selected range. Search/status filters apply to the list, while the overview covers all site links, including archived ones.

## Persistence and operations

`DATA_DIR/tracking-links/links.json` holds link metadata, full edit history and a random persistent HMAC secret. Daily event files live at `DATA_DIR/tracking-links/<SHA256(siteId)>/YYYY-MM-DD.ndjson`. Include the entire directory in production backups; losing the secret breaks visitor continuity. These files are private runtime data and must never be committed or served as static assets.

Writes use a process-local queue; metadata is replaced atomically and events are appended to daily files. Reports stream fixed snapshots of complete appends. Keep the existing **single PM2 process**. Multiple processes/hosts would require shared transactional storage before scaling. A site can create up to 1,000 links. Historical files are retained; monitor disk usage and back them up. No destructive data migration or new production dependency is needed.

Routes (all relative to the configured base path):

- `GET /api/sites/:siteId/links?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/sites/:siteId/links/:linkId?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/sites/:siteId/links` with `name`, `description`, `targetUrl`
- `PATCH /api/sites/:siteId/links/:linkId` with any of `name`, `description`, `targetUrl`, `status` (`active`, `disabled`, `archived`)
- `GET /r/:code`

The service is implemented in `lib/tracking-links.js`. The client workspace is in `public/links.js` and `public/links.css`, using the tokens in `public/styles.css`. Asset cache versions include both new frontend files. This feature does not require ServerMonitor to be available.

## Verification

Run `npm.cmd run check` and `npm.cmd run test:links`. The integration suite uses isolated temporary data, real authentication and real HTTP requests. It covers cross-client access, permissions, destination boundaries, redirect headers, bot separation, deduplication, date validation, history, archive/restore, inactive owners, concurrent writes, disk reload and base-path assets. UI checks should include 375px and desktop layouts, both themes, creation/editing/copying, filters, daily data disclosure and history. Sample data must stay in an ignored local test directory.
