# UI and UX Guide

The product should feel premium, minimal, fast, and practical. It is not a marketing site. It is a working management tool.

## Design Direction

Current visual language:

- restrained ink, cream, forest, and brass
- strong typography
- sharp cards and panels
- dense but clean operational layout
- no public landing page or marketing fluff
- the client workspace may use a hero-style first section when it is functional: live preview, site identity, image readiness, and primary actions

Avoid generic dashboard styling. The UI should feel custom, professional, and client-ready.

## Design Tokens

Everything visual comes from the `:root` block at the top of `public/styles.css`.
Login, client studio, and admin share one system; the older `--ink/--paper/--gold`
names are kept as aliases so legacy admin rules inherit it.

**Do not add a raw hex, a raw font size, or a raw spacing value to a component
rule.** If nothing in the scale fits, add a token — that is a deliberate,
reviewable decision. Ad-hoc values are how this file previously accumulated 65
distinct font sizes and nine near-identical greys.

### Colour

| Token | Use |
| --- | --- |
| `--studio-white` / `--studio-paper` / `--studio-canvas` / `--studio-canvas-deep` | surfaces, lightest to deepest |
| `--studio-ink` / `--studio-ink-soft` | primary text, dark fills |
| `--studio-muted` / `--studio-muted-strong` | secondary text |
| `--studio-forest` / `--studio-forest-hover` | primary actions everywhere |
| `--studio-brass` | decorative only: rules, marks, borders |
| `--studio-brass-ink` | brass *text* |
| `--studio-brass-soft` | brass fills that carry ink text |
| `--state-ok` / `--state-warn` / `--state-danger` / `--state-info` | status |

Contrast rules that the palette is built around:

- `--studio-muted` clears 4.5:1 on every surface including `--studio-canvas-deep`.
- `--studio-brass-ink` clears 4.5:1 on white/paper/canvas. It lands at 3.9:1 on
  `--studio-canvas-deep` — keep brass text off that surface.
- `--studio-brass` cannot carry ink text (3.84:1). Use `--studio-brass-soft` for
  a gold fill with ink on it, or `--studio-forest` with `--studio-on-dark`.

### Type

Hebrew has no ascender/descender cues to lean on, so it needs more size than
Latin at the same rank. **13px is a hard floor** — `--fs-micro` is the smallest
legal size, reserved for overlines, index numerals, and badges.

`--fs-micro` 13 · `--fs-meta` 14 · `--fs-label` 15 · `--fs-body` 16 ·
`--fs-md` 18 · `--fs-lg` 22 · `--fs-xl` 28 · `--fs-2xl` 36 · `--fs-3xl` 44

Display headings may use `clamp()`, but never with a minimum below `1rem`.

A bare `<small>` inherits the UA's `smaller` keyword and compounds downward, so
`small` is floored globally at `max(var(--fs-micro), 0.875em)`.

### Spacing, elevation, motion

`--sp-1` … `--sp-12` on a 4px base. `--elev-1/2/3`. `--dur-fast/--dur/--dur-slow`
with `--ease`. `--control-h` is the 44px touch target. `--focus-ring` and the
global `:focus-visible` outline apply to every surface — do not re-declare them
per view.

Touch sizing is enforced once, in the `@media (pointer: coarse), (max-width: 760px)`
block near the end of the file. It fires on both a coarse pointer and a phone-width
viewport, because pointer queries do not fire in a resized desktop window — which
is where this actually gets verified. A component that pins an explicit `height`
outranks the blanket rule, so add it by name to that block rather than fighting
specificity.

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
2. explicit `תצוגה` and `עריכה` switch; phones open in editing mode so iframe scrolling never blocks management actions
3. mobile preview in `תצוגה`, or a visual section contact sheet in `עריכה`; desktop preview controls remain desktop-only
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

## Client Visitor Workspace

The separate `מבקרים` page should work as a compact traffic ledger, not a generic dashboard:

- lead with unique visitor candidates and current activity
- keep page views, new/returning candidates, and filtered bot requests scannable above the fold
- provide range controls for 24 hours, 7, 30, and 90 days
- show traffic over time, active hours, pages, locations, sources, and devices
- keep explicit `מבקרים`, `בוטים`, and `הכול` tabs; never blend bots into the visitor count
- let a row open the IP activity timeline while keeping IPs, URLs, and paths LTR
- explain once that a candidate is an IP not identified as a bot, not a verified person
- replace the desktop table with touch-friendly cards on mobile

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
- verify visitor range, search, bot separation, pagination, and activity timeline work
- verify visitor controls are at least 44px on mobile and the table becomes cards at `390px`

Rather than eyeballing the last four, run the measurement probe in the browser
console on each view at `1440`, `390`, and `360`. It reports every rendered
string under 13px, every text/background pair under its WCAG AA threshold, every
control under the minimum target for that width, and any horizontal overflow.
The current baseline on all four views at all three widths is zero of each.

```js
(() => {
  const lum=c=>{const s=c.map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4});return .2126*s[0]+.7152*s[1]+.0722*s[2]};
  const parse=s=>{const m=String(s).match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(parseFloat);return{rgb:p.slice(0,3),a:p[3]??1}};
  const bgOf=el=>{let n=el;while(n&&n!==document.documentElement){const cs=getComputedStyle(n),b=parse(cs.backgroundColor);if(b&&b.a>.5)return b.rgb;if(/gradient|url/.test(cs.backgroundImage))return null;n=n.parentElement}return null};
  const cr=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  const dead=el=>{let n=el;while(n&&n!==document.documentElement){const cs=getComputedStyle(n);if(cs.pointerEvents==='none'||cs.opacity==='0'||cs.display==='none'||cs.visibility==='hidden')return true;n=n.parentElement}return false};
  const MIN=innerWidth<=760?44:24, out={tiny:[],low:[],small:[]};
  document.querySelectorAll('body *').forEach(el=>{
    const cs=getComputedStyle(el), rect=el.getBoundingClientRect();
    if(cs.display==='none'||cs.visibility==='hidden'||!rect.width)return;
    const t=(el.textContent||'').trim().slice(0,18)||el.tagName;
    if([...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())){
      const px=parseFloat(cs.fontSize);
      if(px>0&&px<12.5)out.tiny.push({t,px});
      const fg=parse(cs.color), bg=bgOf(el);
      if(fg&&fg.a>.35&&bg){const r=cr(fg.rgb,bg), need=(px>=24||(px>=18.66&&parseInt(cs.fontWeight)>=700))?3:4.5;
        if(r<need-.01)out.low.push({t,cr:+r.toFixed(2),px})}
    }
    if(el.matches('button,a[href],input:not([type=hidden]),select,summary')&&!dead(el)){
      const r=(el.closest('label')||el).getBoundingClientRect();
      if(!el.matches('p a[href],li a[href],span a[href]')&&(r.height<MIN||r.width<MIN))out.small.push({t,w:0|r.width,h:0|r.height})}
  });
  return {vw:innerWidth, hOverflow:document.documentElement.scrollWidth-innerWidth,
          tiny:out.tiny.length, lowContrast:out.low.length, smallTargets:out.small.length, detail:out};
})()
```

## Hebrew Editing Note

Some terminal output on Windows may show Hebrew as mojibake. Do not assume the file is corrupted only because PowerShell renders unreadable Hebrew. Verify through browser rendering or UTF-8-safe tools.
