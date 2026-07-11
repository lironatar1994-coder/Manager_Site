# UI and UX Guide

The product should feel premium, minimal, fast, and practical. It is not a marketing site. It is a working management tool.

## Design Direction

Current visual language:

- restrained black, cream, gold, and blue accents
- strong typography
- sharp cards and panels
- dense but clean operational layout
- no public landing page or marketing fluff
- the client workspace may use a hero-style first section when it is functional: live preview, site identity, image readiness, and primary actions

Avoid generic dashboard styling. The UI should feel custom, professional, and client-ready.

## Language and Direction Rules

Login:

- Hebrew
- RTL
- username/password fields remain LTR

Client workspace:

- Hebrew
- RTL
- URLs remain LTR
- route examples remain LTR
- website names may remain as created by admin

Admin workspace:

- Hebrew
- RTL
- operational labels, dialogs, errors, and audit text should stay Hebrew
- usernames, URLs, IDs, and route examples remain LTR

## Mobile UX Priorities

Most clients will use phones. Keep mobile flows fast:

- Login form must be reachable without awkward scrolling.
- Client top navigation should stay compact and usable.
- The live website preview should appear before the editing list on mobile.
- The preview must include desktop/mobile controls.
- The preview should load the client's configured public URL in an iframe and refresh without server-side browser automation.
- Buttons and inputs should be comfortable touch targets.
- Avoid horizontal overflow at `390px` and `360px`.
- The preview is the orientation layer; the image rail below is the exact edit list.

The current mobile order for clients is:

1. compact site header with open, share, and site-link actions
2. live desktop/mobile preview as the dominant first-screen element
3. persistent `עריכת האתר` bottom drawer with a visual section contact sheet
4. full-screen section editor and tap-first image actions for replace, crop, restore, and delete

## Client Workflow

The client should immediately understand:

- which website they are managing
- how the website currently looks on desktop and mobile
- how to change the website link
- which image area they are editing
- how to upload or replace an image

Do not show internal review/status/approval language in the first client-facing section. Admin-only status controls may exist for admin preview, but the normal client experience should read like a simple website image manager.

The first client section should be visual before explanatory. Keep copy short and make the live website preview the dominant element; avoid long paragraphs, internal process language, or empty dashboard metrics. On mobile, the editing drawer should remain one tap away without pushing the preview out of view.

Use explicit labels. Do not hide core actions behind unclear icons.

The client image rail should read as a practical task list. Each image area should show current/missing state, recommended size, and one obvious primary action; advanced choices stay inside the image modal.

On mobile, image modals must be tap-first and minimal: image preview, short title, primary action, crop/replace controls, and sticky confirmation. File size, dimensions, backup state, and quality checks belong inside collapsed details, not in the main flow.

## Admin Workflow

The admin should quickly:

- see active clients, sites, image volume, and activity
- create a client
- assign permissions
- preview a client workspace
- pause users
- mark published or needs attention

The admin workspace should not revolve around a review queue. Keep it quiet: client records first, creation flow second, recent activity compressed below. Technical IDs, passwords, and permissions should be accessible but not dominate the default card view.

Admin mobile should feel deliberate and premium: stacked sections, clear client cards, comfortable action buttons, and no crumbled rows.

## Visual QA Checklist

Before finishing UI changes:

- check desktop and mobile
- verify no horizontal overflow
- verify text does not overlap
- verify Hebrew text direction
- verify URLs/usernames remain readable LTR
- verify buttons are not cramped
- verify client upload path is obvious on mobile
- verify desktop/mobile live preview loads or fails gracefully if the client website blocks framing
- verify the first client section does not expose internal review/status/approval wording
- verify login still has no English operational copy

## Hebrew Editing Note

Some terminal output on Windows may show Hebrew as mojibake. Do not assume the file is corrupted only because PowerShell renders unreadable Hebrew. Verify through browser rendering or UTF-8-safe tools.
