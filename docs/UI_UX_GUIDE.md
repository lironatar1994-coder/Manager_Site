# UI and UX Guide

Manager Site is a protected Hebrew website manager. There is no public signup.
The Current design system starts with phone workflows and expands to desktop.

## Design direction and files

- Graphite and deep green establish hierarchy; lime highlights a main metric.
- Heebo headings and body text share a clear Hebrew rhythm. Assistant is the fallback.
- Rounded surfaces, short copy, generous touch targets, and progressive disclosure.
- `public/styles.css`: literal theme tokens and existing component foundations.
- `public/interface.css`: shared responsive design, loaded last after `links.css`.
- `public/interface.js`: navigation, account sheet, and login presentation.
- `public/app.js`: existing routing, authorization-aware workflows, and content views.
- `public/links.js` and `public/links.css`: tracking-link workspace.

Read the token block before styling. Never add raw colors to component rules or
alias one token to another with `var()`. New colors belong in all three token
blocks. Keep the automatic dark fallback and manual dark palette identical.
Boot uses explicit light mode unless a manual dark preference was stored.

| Tokens | Purpose |
| --- | --- |
| `--bg`, `--surface`, `--surface-2`, `--surface-sunken` | Page and layered surfaces |
| `--ink`, `--ink-soft`, `--muted` | Primary and secondary text |
| `--brand`, `--brand-soft` | Green text and subtle selection backgrounds |
| `--brand-solid`, `--on-brand` | Filled primary controls |
| `--lime`, `--on-lime` | Main metric highlight |
| `--stage`, `--on-dark`, `--on-dark-muted` | Always-dark feature surfaces |
| `--line`, `--line-strong` | Decorative dividers and control boundaries |
| `--state-ok/warn/danger/info` and matching soft tokens | Semantic status |

Do not use theme-inverting text on an always-dark surface. Keep controls at
least 44 by 44 pixels on phones (the normal input/button height is 48 pixels).
Inputs use at least 16px text to avoid focus zoom. Small supporting text must
not fall below 13px. Respect reduced motion and visible keyboard focus.

## Navigation and mobile layout

Client navigation has four stable destinations: site, visitors, links, account.
At 760px and below it sits at the bottom with safe-area clearance; wider views
have a right rail. Account actions include theme, logout, and admin navigation
when authorized. A skip link leads to the main content.

Phones open the live preview first. The explicit preview/edit switch offers
one-tap access to a list of content sections. At desktop widths the live iframe
and editing sections share the workspace. Keep desktop/mobile iframe controls
on desktop and use the phone-sized iframe on phones. Do not install server-side
browser tooling or replace the iframe with screenshots.

Dialogs use bottom sheets on phones and centered panels on desktop, above the
bottom navigation. Prevent background scrolling, trap keyboard focus, support
Escape and labelled close controls, and restore focus on close. Toasts sit above
the mobile navigation and must remain within the viewport.

## Language and content

Use Hebrew and RTL for login, client, analytics, and admin UI. Keep usernames,
URLs, network identifiers, and routes LTR (`bdi` or explicit `dir`). Backend
client routes remain `/client/:username`. Website names can retain their saved
language. Login stays short, with supplied credentials and no signup flow.

The first client section identifies the site and presents the live preview.
Do not expose internal review, approval, or publishing process language there.
Content cards should name the section and make its next action obvious.
Keep dimensions, backup metadata, and advanced image details in disclosures.

## Visitor and link analytics

Lead the visitor page with unique visitor candidates and active candidates.
A candidate is an IP with a successful page view not identified as a bot; it
is not a verified person. Keep candidate/bot/all tabs explicit, and do not count
assets, APIs, failed requests, or non-navigation requests as page engagement.
Use cards on mobile and a table on desktop; both open the activity timeline.

Tracking links have named records, a destination within the assigned site,
optional description, edit/status actions, and their own report. Date controls
are collapsed by default. Selecting a link opens a focused detail view with a
clear return action. See `docs/TRACKING_LINKS.md` for counting semantics.

Never expose the analytics service key or let the browser choose an upstream
application ID. Visitor analytics must resolve from the stored website URL.
Dynamic chart dimensions use individual DOM style properties; inline HTML style
attributes are blocked by the existing Content Security Policy.

## Admin workflow

Show client records before the collapsed client-creation panel, then recent
activity. Keep permission and credential details out of the default card view.
Provide clear open, edit, and pause controls. Bottom navigation links directly
to clients, activity, creation, and account. Do not add public registration.

## Verification

Run `npm.cmd run check` after JavaScript changes and `npm.cmd run test:links`
when tracking-link code changes. Use an already available browser for visual QA.

Check at phone widths (360/375px), a tablet width, and desktop (1440px), in both
themes. Verify no horizontal overflow, readable Hebrew, LTR URLs, at least 44px
phone controls, visible focus, and WCAG AA text/control contrast. Check login
success/error, account theme/logout, site preview/edit, image action sheets,
link creation/edit/detail/back, analytics filters/timeline, and client management.
Check that dialogs and toasts clear the navigation and the home indicator.

Use isolated local data when testing mutations. A local analytics fixture is
useful for visual checks but does not verify production traffic data. Verify
the live route returns 200 after an authorized deployment; do not describe a
local redesign as deployed.

Some PowerShell output may display Hebrew incorrectly even when UTF-8 files
are valid. Verify the rendered text before assuming file corruption.