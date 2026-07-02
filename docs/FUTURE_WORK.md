# Future Work

This file is for future agents to understand likely next improvements without guessing the product direction.

## Highest-Value Next Steps

### 1. Persistent Sessions

Sessions are currently in memory. A PM2 restart logs users out. For production polish, move sessions to a persistent store or signed stateless session strategy.

### 2. Better Admin Editing

Admin can create, pause, reset, share, and edit client details/permissions, but future polish could add:

- audit filters
- image review queue with thumbnails

### 3. Real Website Integration

The current app has a live desktop/mobile iframe preview inside Manager Site. A future version should define whether changed production assets need extra propagation steps for each actual client website:

- manual export
- API push
- shared uploads directory
- webhook
- build trigger

The first safe integration layer now exists through `client.config.json`: Manager Site can scan allowlisted production image paths, serve them through authenticated asset URLs, and replace/remove them with backups when the configured `siteRoot` exists. The remaining work is to point each client config at the real website folders and decide how published changes should trigger cache clears or rebuilds.

### 4. Image Quality Controls

Useful additions:

- image dimensions display
- crop/position controls
- recommended size per slot
- compression or conversion
- preview before upload
- replace history

### 5. Stronger Client Review Flow

Current statuses are simple. Future workflow could include:

- admin comments
- client notes per image
- per-slot approval
- email or WhatsApp notification
- status history visible to clients

### 6. Admin Localization Follow-Up

Login, admin, and client views are Hebrew RTL. Future admin work should keep labels, dialogs, validation feedback, and audit text Hebrew while preserving usernames, URLs, IDs, and backend route examples in LTR.

### 7. Accessibility Pass

Recommended checks:

- keyboard navigation
- focus states
- screen reader labels
- contrast
- modal focus trap
- file upload accessibility

## Things Not To Do Without Explicit Approval

- Do not add public registration.
- Do not change `/client/:username` backend routing to Hebrew.
- Do not expose uploads publicly without auth.
- Do not remove the admin review/status model.
- Do not replace the current app with a marketing landing page.
- Do not delete or reset production data.

## Current Verification Baseline

Recent verification covered:

- `npm.cmd run check`
- local login/client/admin mobile rendering
- managed preview desktop/mobile toggle
- five editable preview markers for hero, logo, about, service, and gallery
- no horizontal overflow at `390px` and `360px`
- live route `https://vee-app.co.il/Manager_Site/login` returning `200`
- live assets including the mobile CSS and Hebrew ratio label handling

Future UI work should keep at least that level of verification.
