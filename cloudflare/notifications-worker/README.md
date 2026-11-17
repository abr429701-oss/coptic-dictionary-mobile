# Coptic App — Cloudflare Notifications

This Worker is a separate push-notification path. It does not replace or modify the existing Google Sheets / Apps Script registration flow or local notifications.

## Deployed resources

- Worker: `coptic-app-notifications`
- Public base URL: `https://coptic-app-notifications.abraammerzik56.workers.dev`
- D1 database: `coptic-app-notifications`
- D1 database ID: `05c0888d-9adf-40ab-85bd-8ff1df865996`
- Cron: every minute, for scheduled sends and Expo receipt checks

## Endpoints

- `GET /health` — checks that the Worker can reach D1.
- `POST /v1/register` — upserts an Expo push token and the app language/platform/version.
- `POST /admin/import-legacy` — admin-protected import in batches of up to 100. Normal imports preserve existing records; a full-source reconciliation may set `reconcileStart: true` on its first batch, which deactivates prior `legacy-import` rows and then reactivates only rows included in all submitted batches. Never use reconciliation without sending the complete source list.
- `GET /admin` — Arabic admin page for immediate or scheduled broadcasts to all users, Arabic users, or English users.
- `POST /admin/app-login` — validates the app's admin PIN held only as the Worker secret `ADMIN_APP_PIN`.
- `GET /admin/devices`, `GET /admin/notifications`, and `GET /admin/versions` — authenticated device, notification-history, and active-version reports.
- `POST /admin/send` — authenticated with the Cloudflare Worker secret `ADMIN_API_TOKEN`.

Admin credentials are deliberately not stored in this repository or embedded in the mobile app. Set the app PIN as a Worker secret with `npx wrangler secret put ADMIN_APP_PIN --config wrangler.jsonc`; never commit it or print it in application logs.

## Local checks and deployment

From this directory, with a Cloudflare API token that has only the necessary account-level Workers Scripts Edit permission and the account ID set in the environment:

```powershell
npx wrangler deploy --config wrangler.jsonc
```

The D1 schema is in `schema.sql`; it has already been applied to the deployed database. After a new database is created, apply it with Wrangler's remote D1 execute command before deployment.
