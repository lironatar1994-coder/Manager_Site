# Future Work

This file is for future agents to understand likely next improvements without guessing the product direction.

## Highest-Value Next Steps

### 1. Persistent Sessions

Sessions are currently in memory. A PM2 restart logs users out. For production polish, move sessions to a persistent store or signed stateless session strategy.

### 2. Better Admin Editing

Admin can create and pause users, but future polish could add:

- edit client details in a modal
- reset password workflow
- clearer permission editing
- audit filters
- image review queue with thumbnails

### 3. Real Website Integration

The current app manages images and metadata inside Manager Site. A future version should define how changes propagate to each actual client website:

- manual export
- API push
- shared uploads directory
- webhook
- build trigger

Do not assume this integration exists yet.

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

### 6. Full Admin Localization

Login and client views are Hebrew RTL. Admin is still English LTR. If requested, localize admin as a complete workflow rather than changing only scattered labels.

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
- no horizontal overflow at `390px` and `360px`
- live route `https://vee-app.co.il/Manager_Site/login` returning `200`
- live assets including the mobile CSS and Hebrew ratio label handling

Future UI work should keep at least that level of verification.
