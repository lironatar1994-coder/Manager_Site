# UI and UX Guide

The product should feel premium, minimal, fast, and practical. It is not a marketing site. It is a working management tool.

## Design Direction

Current visual language:

- restrained black, cream, gold, and blue accents
- strong typography
- sharp cards and panels
- dense but clean operational layout
- no public landing page or marketing hero

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

- currently English
- currently LTR

If localizing admin later, do it intentionally across the whole admin workflow.

## Mobile UX Priorities

Most clients will use phones. Keep mobile flows fast:

- Login form must be reachable without awkward scrolling.
- Client top navigation should stay compact and usable.
- The real website screenshot preview should appear before the editing list on mobile.
- The preview must include desktop/mobile controls.
- The preview should load saved images from `public/client-previews/<username>/desktop.png` and `public/client-previews/<username>/mobile.png` when available.
- Buttons and inputs should be comfortable touch targets.
- Avoid horizontal overflow at `390px` and `360px`.
- The preview is the orientation layer; the image rail below is the exact edit list.

The current mobile order for clients is:

1. clean Hebrew site header and link edit
2. real desktop/mobile screenshot preview
3. drag/drop image rail
4. image action modal for replace, delete, and crop

## Client Workflow

The client should immediately understand:

- which website they are managing
- how the website currently looks on desktop and mobile
- how to change the website link
- which image area they are editing
- how to upload or replace an image

Do not show internal review/status/approval language in the first client-facing section. Admin-only status controls may exist for admin preview, but the normal client experience should read like a simple website image manager.

Use explicit labels. Do not hide core actions behind unclear icons.

## Admin Workflow

The admin should quickly:

- see active clients, review queue, sites, and images
- create a client
- assign permissions
- preview a client workspace
- pause users
- mark publish or needs attention

Admin mobile should remain usable, but client mobile is the higher-priority UX.

## Visual QA Checklist

Before finishing UI changes:

- check desktop and mobile
- verify no horizontal overflow
- verify text does not overlap
- verify Hebrew text direction
- verify URLs/usernames remain readable LTR
- verify buttons are not cramped
- verify client upload path is obvious on mobile
- verify desktop/mobile screenshot previews load and are not blank
- verify the first client section does not expose internal review/status/approval wording
- verify login still has no English operational copy

## Hebrew Editing Note

Some terminal output on Windows may show Hebrew as mojibake. Do not assume the file is corrupted only because PowerShell renders unreadable Hebrew. Verify through browser rendering or UTF-8-safe tools.
