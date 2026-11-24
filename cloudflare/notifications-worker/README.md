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
- `GET /v1/settings` — returns public remote app settings, including the validated notification schedule used by clients and cached locally for offline use.
- `GET /admin/settings` and `POST /admin/settings` — read and save admin-protected settings, including daily word, Coptic month/year, Gregorian New Year, and audio download/continue reminder times (`HH:MM`, interpreted in each device's local timezone).
- `GET /admin/settings/history` — returns the recent settings change history, including notification schedule snapshots.
- `POST /admin/app-login` — validates the app's admin PIN held only as the Worker secret `ADMIN_APP_PIN`.
- `GET /admin/devices`, `GET /admin/notifications`, and `GET /admin/versions` — authenticated device, notification-history, and active-version reports.
- `POST /admin/send` — authenticated with the Cloudflare Worker secret `ADMIN_API_TOKEN`.
- `POST /admin/media` — admin-session-protected upload of JPEG, PNG, or WebP images up to 5 MiB to the private `MEDIA` R2 binding.
- `GET /media/<key>` — serves uploaded notification images from R2 with immutable caching; the bucket itself remains private.

### Remote Bible content

- `GET /v1/bible/books` — returns remotely overridden book metadata.
- `GET /v1/bible/book?book=<id>&language=<code>` — returns remote verse overrides for a book.
- `GET /v1/bible/chapter?book=<id>&chapter=<number>` — returns remote overrides for a chapter.
- `POST /admin/bible/changes` — authenticated verse changes or tombstones; up to 500 rows per request. The app admin panel sends batches of up to 250 and records each batch separately for undo.
- `POST /admin/bible/book` — authenticated book metadata create/update or reversible removal from the remote catalogue.
- `GET /admin/bible/history` and `POST /admin/bible/undo` — inspect recent edits and restore the previous values.

The mobile app overlays remote changes on its bundled Bible files and continues to use those local files offline. The admin panel accepts the bundled per-book JSON shape (`[{"chapter":1,"verse":1,"text":"..."}]`) when a book number and language are selected, as well as verse rows with explicit `book`/`language` fields and objects containing `books`, `chapters`, and `verses`. Imports are split into independent, undoable batches; a partially failed import may therefore require undoing each successful batch separately. Removing a remote book/group creates reversible tombstones for active remote verse overrides and hides remote book metadata. It does not delete bundled JSON or the local offline copy; undo verse batches and book-metadata operations separately from the history list.

Admin credentials are deliberately not stored in this repository or embedded in the mobile app. Set the app PIN as a Worker secret with `npx wrangler secret put ADMIN_APP_PIN --config wrangler.jsonc`; never commit it or print it in application logs.

## Local checks and deployment

From this directory, with a Cloudflare API token that has only the necessary account-level Workers Scripts Edit permission and the account ID set in the environment:

```powershell
npx wrangler deploy --config wrangler.jsonc
```

The base D1 schema is in `schema.sql`. Apply pending migrations before deploying code that depends on them:

```powershell
npx wrangler d1 migrations apply coptic-app-notifications --remote --config wrangler.jsonc
npx wrangler deploy --config wrangler.jsonc
```

The Bible content tables are added by `migrations/0005_remote_bible_content.sql`; `migrations/0006_notification_image_url.sql` adds the optional image URL column without removing existing notifications. Check `npx wrangler d1 migrations list coptic-app-notifications --remote --config wrangler.jsonc` first; do not manually reapply an already-recorded migration.

Image uploads require an active Cloudflare R2 subscription and the bucket `coptic-app-notification-media`. The Worker binds this bucket as `MEDIA`; keep the bucket private because `/media/<key>` is served through the Worker. R2 activation and bucket provisioning must be completed in the Cloudflare Dashboard before deploying this binding. The app compresses selected images to JPEG before upload; direct HTTPS image URLs can also be used without uploading.
- `POST /admin/import-google-sheet-tokens` — admin-session-protected preview and import from a Google Sheets URL, sheet `gid`, and column letter. The source sheet must be readable by anyone with its link. Preview does not write data; confirmed imports add valid unique Expo tokens in batches and do not deactivate existing devices.
