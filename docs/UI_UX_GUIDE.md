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
- Upload/edit image controls must appear before the large website preview on mobile.
- Buttons and inputs should be comfortable touch targets.
- Avoid horizontal overflow at `390px` and `360px`.
- Keep the website preview available, but do not let it block the primary editing workflow.

The current mobile order for clients is:

1. compact site header and link edit
2. image upload/edit panel
3. slot cards
4. readiness/status panel
5. website preview

## Client Workflow

The client should immediately understand:

- which website they are managing
- current status
- how to change the website link
- which image area they are editing
- how to upload or replace an image
- how to send for review

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
- verify login still has no English operational copy

## Hebrew Editing Note

Some terminal output on Windows may show Hebrew as mojibake. Do not assume the file is corrupted only because PowerShell renders unreadable Hebrew. Verify through browser rendering or UTF-8-safe tools.
