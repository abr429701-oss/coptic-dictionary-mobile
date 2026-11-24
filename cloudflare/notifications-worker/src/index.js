const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_BODY_BYTES = 256 * 1024;

const ADMIN_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>إشعارات قاموس خمي</title>
  <style>
    :root{color-scheme:light dark;--bg:#f5f1e9;--card:#fff;--ink:#25211d;--muted:#746b60;--accent:#7b263a;--line:#e7dfd4}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px system-ui,"Segoe UI",sans-serif;padding:24px}
    main{max-width:680px;margin:0 auto}.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:0 12px 36px #38250f12}
    h1{font-size:24px;margin:0 0 8px;color:var(--accent)}p{color:var(--muted);line-height:1.7;margin:0 0 20px}
    label{display:block;font-weight:650;margin:16px 0 7px}input,textarea,select{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font:inherit}
    textarea{min-height:120px;resize:vertical}button{margin-top:20px;background:var(--accent);color:white;border:0;border-radius:10px;padding:12px 20px;font:inherit;font-weight:700;cursor:pointer}
    button:disabled{opacity:.6;cursor:wait}#result{margin-top:18px;white-space:pre-wrap;line-height:1.6}.hint{font-size:13px}
  </style>
</head>
<body><main><section class="card">
  <h1>إرسال إشعار جديد</h1>
  <p>لوحة خاصة بإشعارات Cloudflare الجديدة. تسجيل رموز الأجهزة والإشعارات المحلية والنظام القديم منفصلون عنها.</p>
  <label for="key">مفتاح الإدارة</label><input id="key" type="password" autocomplete="current-password" placeholder="أدخل مفتاح الإدارة المحلي">
  <label for="title">عنوان الإشعار</label><input id="title" maxlength="120" required>
  <label for="body">نص الإشعار</label><textarea id="body" maxlength="4000" required></textarea>
  <label for="language">المستلمون</label><select id="language"><option value="all">كل المستخدمين</option><option value="ar">التطبيق بالعربية</option><option value="en">التطبيق بالإنجليزية</option></select>
  <label for="schedule">موعد الإرسال (اختياري)</label><input id="schedule" type="datetime-local"><p class="hint">اترك الموعد فارغًا للإرسال الفوري. تُحوّل أوقات الجدولة إلى UTC على الخادم.</p>
  <button id="send">إرسال الإشعار</button><div id="result" role="status"></div>
</section></main>
<script>
  const $ = (id) => document.getElementById(id);
  $('send').addEventListener('click', async () => {
    const button = $('send'); const result = $('result');
    const key = $('key').value; const title = $('title').value.trim(); const body = $('body').value.trim();
    if (!key || !title || !body) { result.textContent = 'أدخل مفتاح الإدارة والعنوان والنص.'; return; }
    const scheduledLocal = $('schedule').value;
    const payload = { title, body, language: $('language').value };
    if (scheduledLocal) payload.scheduledAt = new Date(scheduledLocal).toISOString();
    button.disabled = true; result.textContent = 'جارٍ تجهيز الإشعار…';
    try {
      const response = await fetch('/admin/send', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+key}, body:JSON.stringify(payload) });
      const data = await response.json();
      result.textContent = response.ok ? JSON.stringify(data, null, 2) : (data.error || 'تعذر الإرسال');
      if (response.ok && !scheduledLocal) { $('title').value=''; $('body').value=''; }
    } catch (error) { result.textContent = 'تعذر الاتصال بالخادم.'; }
    finally { button.disabled = false; }
  });
</script></body></html>`;

function json(request, payload, status = 200) {
  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(payload), { status, headers });
}

function corsHeaders(request) {
  const headers = new Headers();
  const origin = request.headers.get('Origin');
  headers.set('Access-Control-Allow-Origin', origin || '*');
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_BODY_BYTES) throw new Error('request_too_large');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new Error('request_too_large');
  try { return JSON.parse(text); } catch { throw new Error('invalid_json'); }
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function encodeBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signSession(payload, secret) {
  const body = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function isValidSession(token, secret) {
  try {
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const normalized = signature.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
    const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
    if (!await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(body))) return false;
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - body.length % 4) % 4)));
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

function getBearer(request) {
  const value = request.headers.get('Authorization') || '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

async function hashText(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function rateLimitFailedAdminAttempt(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipHash = await hashText(ip);
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const row = await env.DB.prepare('SELECT window_started_at, attempts FROM admin_attempts WHERE ip_hash = ?').bind(ipHash).first();
  if (row && now - row.window_started_at < windowMs && row.attempts >= 5) return false;
  if (!row || now - row.window_started_at >= windowMs) {
    await env.DB.prepare('INSERT INTO admin_attempts (ip_hash, window_started_at, attempts) VALUES (?, ?, 1) ON CONFLICT(ip_hash) DO UPDATE SET window_started_at = excluded.window_started_at, attempts = 1').bind(ipHash, now).run();
  } else {
    await env.DB.prepare('UPDATE admin_attempts SET attempts = attempts + 1 WHERE ip_hash = ?').bind(ipHash).run();
  }
  return true;
}

async function authorizedAdmin(request, env) {
  if (!env.ADMIN_API_TOKEN) return false;
  const supplied = getBearer(request);
  if (await isValidSession(supplied, env.ADMIN_API_TOKEN)) return true;
  if (!constantTimeEqual(supplied, env.ADMIN_API_TOKEN)) {
    await rateLimitFailedAdminAttempt(request, env);
    return false;
  }
  return true;
}

async function adminLogin(request, env) {
  if (!env.ADMIN_API_TOKEN) return json(request, { error: 'admin_not_configured' }, 503);
  const data = await readJson(request);
  const passphrase = String(data.passphrase || '');
  if (!constantTimeEqual(passphrase, env.ADMIN_API_TOKEN)) {
    const allowed = await rateLimitFailedAdminAttempt(request, env);
    return json(request, { error: allowed ? 'invalid_credentials' : 'rate_limited' }, allowed ? 401 : 429);
  }
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  const token = await signSession({ exp: expiresAt }, env.ADMIN_API_TOKEN);
  return json(request, { success: true, token, expiresAt });
}

async function adminAppLogin(request, env) {
  if (!env.ADMIN_APP_PIN) return json(request, { error: 'admin_pin_not_configured' }, 503);
  const data = await readJson(request);
  const pin = String(data.pin || '');
  if (!constantTimeEqual(pin, env.ADMIN_APP_PIN)) {
    const allowed = await rateLimitFailedAdminAttempt(request, env);
    return json(request, { error: allowed ? 'invalid_credentials' : 'rate_limited' }, allowed ? 401 : 429);
  }
  const ipHash = await hashText(request.headers.get('CF-Connecting-IP') || 'unknown');
  await env.DB.prepare('DELETE FROM admin_attempts WHERE ip_hash = ?').bind(ipHash).run();
  return json(request, { success: true });
}

async function adminDevices(request, env) {
  if (!await authorizedAdmin(request, env)) return json(request, { error: 'unauthorized_or_rate_limited' }, 401);
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get('limit') || 1000);
  const limit = Math.min(1000, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 1000));
  const page = Math.max(1, Math.floor(Number(url.searchParams.get('page') || 1)) || 1);
  const rows = await env.DB.prepare('SELECT expo_token, app_version, platform, language, last_seen_at FROM devices WHERE active = 1 ORDER BY last_seen_at DESC LIMIT ? OFFSET ?').bind(limit, (page - 1) * limit).all();
  const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM devices WHERE active = 1').first();
  const devices = (rows.results || []).map((row) => ({ deviceKey: row.expo_token, label: `${row.platform || 'جهاز'}${row.app_version ? ` · ${row.app_version}` : ''}`, appVersion: row.app_version, platform: row.platform, language: row.language, lastSeenAt: row.last_seen_at }));
  return json(request, { success: true, devices, total: Number(count?.total || 0), page, limit });
}

async function adminNotificationHistory(request, env) {
  if (!await authorizedAdmin(request, env)) return json(request, { error: 'unauthorized_or_rate_limited' }, 401);
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get('limit') || 50);
  const limit = Math.min(100, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 50));
  const { results = [] } = await env.DB.prepare('SELECT id, title, language, status, scheduled_at, created_at, sent_at, total_targets, accepted_count, error_count, target_filter, image_url FROM notifications ORDER BY created_at DESC LIMIT ?').bind(limit).all();
  const notifications = results.map((row) => {
    let filter = {};
    try { filter = JSON.parse(row.target_filter || '{}'); } catch {}
    return { ...row, target_filter: undefined, app_version: String(filter.appVersion || ''), selected_devices: Array.isArray(filter.deviceKeys) ? filter.deviceKeys.length : 0 };
  });
  return json(request, { success: true, notifications });
}

async function adminVersionBreakdown(request, env) {
  if (!await authorizedAdmin(request, env)) return json(request, { error: 'unauthorized_or_rate_limited' }, 401);
  const { results = [] } = await env.DB.prepare("SELECT CASE WHEN app_version = '' THEN 'غير محدد' ELSE app_version END AS version, COUNT(*) AS devices, SUM(CASE WHEN language = 'ar' THEN 1 ELSE 0 END) AS arabic, SUM(CASE WHEN language = 'en' THEN 1 ELSE 0 END) AS english, SUM(CASE WHEN platform = 'android' THEN 1 ELSE 0 END) AS android, SUM(CASE WHEN platform = 'ios' THEN 1 ELSE 0 END) AS ios FROM devices WHERE active = 1 GROUP BY app_version ORDER BY devices DESC, app_version DESC").all();
  const total = results.reduce((sum, row) => sum + Number(row.devices || 0), 0);
  return json(request, { success: true, total, versions: results.map((row) => ({ ...row, share: total ? Math.round((Number(row.devices || 0) / total) * 100) : 0 })) });
}

function normalizeNotificationImageUrl(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function detectNotificationImage(bytes) {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return { type: 'image/png', extension: 'png' };
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { type: 'image/jpeg', extension: 'jpg' };
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return { type: 'image/webp', extension: 'webp' };
  return null;
}

async function adminUploadNotificationImage(request, env) {
  if (!await authorizedAdmin(request, env)) return json(request, { error: 'unauthorized_or_rate_limited' }, 401);
  if (!env.MEDIA) return json(request, { error: 'r2_media_binding_not_configured' }, 503);
  const maxFileBytes = 5 * 1024 * 1024;
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > maxFileBytes + 128 * 1024) return json(request, { error: 'image_too_large_max_5mb' }, 413);
  let form;
  try { form = await request.formData(); }
  catch { return json(request, { error: 'invalid_multipart_upload' }, 400); }
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function' || !Number.isFinite(file.size) || file.size <= 0) return json(request, { error: 'image_file_required' }, 400);
  if (file.size > maxFileBytes) return json(request, { error: 'image_too_large_max_5mb' }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectNotificationImage(bytes);
  if (!detected || (file.type && file.type.toLowerCase() !== detected.type)) return json(request, { error: 'unsupported_or_invalid_image_type' }, 400);
  const key = `notification-images/${crypto.randomUUID()}.${detected.extension}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: detected.type, cacheControl: 'public, max-age=31536000, immutable' } });
  return json(request, { success: true, imageUrl: new URL(`/media/${key}`, request.url).toString() });
}

async function serveNotificationImage(request, env) {
  if (!env.MEDIA) return json(request, { error: 'r2_media_binding_not_configured' }, 503);
  let key;
  try { key = decodeURIComponent(new URL(request.url).pathname.slice('/media/'.length)); }
  catch { return json(request, { error: 'invalid_media_key' }, 400); }
  if (!/^notification-images\/[a-f0-9-]+\.(?:jpg|png|webp)$/i.test(key)) return json(request, { error: 'invalid_media_key' }, 404);
  const object = await env.MEDIA.get(key);
  if (!object) return json(request, { error: 'media_not_found' }, 404);
  const headers = corsHeaders(request);
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Cache-Control', object.httpMetadata?.cacheControl || 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  return new Response(object.body, { headers });
}

function normalizeLanguage(value) {
  return value === 'ar' || value === 'en' ? value : 'all';
}

async function registerDevice(request, env) {
  const data = await readJson(request);
  const token = String(data.expoToken || data.expo_token || '').trim();
  const language = normalizeLanguage(data.language || data.lang);
  const version = String(data.appVersion || data.app_version || '').slice(0, 40);
  const platform = String(data.platform || '').slice(0, 20);
  const tokenPattern = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,128}\]$/;
  if (!tokenPattern.test(token)) return json(request, { error: 'invalid_expo_token' }, 400);
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO devices (expo_token, language, app_version, platform, active, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(expo_token) DO UPDATE SET language=excluded.language, app_version=excluded.app_version, platform=excluded.platform, active=1, last_seen_at=excluded.last_seen_at`).bind(token, language, version, platform, now, now).run();
  return json(request, { registered: true });
}

async function importLegacyDevices(request, env) {
  if (!await authorizedAdmin(request, env)) return json(request, { error: 'unauthorized_or_rate_limited' }, 401);
  const data = await readJson(request);
  if (!Array.isArray(data.devices) || data.devices.length > 100) {
    return json(request, { error: 'devices_must_be_an_array_of_at_most_100_items' }, 400);
  }

  const tokenPattern = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,128}\]$/;
  const unique = new Map();
  let invalid = 0;
  let duplicates = 0;
  for (const row of data.devices) {
    const token = String(row?.expoToken || row?.expo_token || '').trim();
    if (!tokenPattern.test(token)) { invalid++; continue; }
    if (unique.has(token)) { duplicates++; continue; }
    unique.set(token, normalizeLanguage(row?.language));
  }

  const now = Date.now();
  let reconciledInactive = 0;
  if (data.reconcileStart === true) {
    const reset = await env.DB.prepare("UPDATE devices SET active = 0, last_seen_at = ? WHERE app_version = 'legacy-import' AND active = 1").bind(now).run();
    reconciledInactive = reset.meta?.changes || 0;
  }
  const rows = [...unique.entries()];
  const results = rows.length ? await env.DB.batch(rows.map(([token, language]) =>
    env.DB.prepare("INSERT INTO devices (expo_token, language, app_version, platform, active, created_at, last_seen_at) VALUES (?, ?, 'legacy-import', 'unknown', 1, ?, ?) ON CONFLICT(expo_token) DO UPDATE SET language = excluded.language, active = 1, last_seen_at = excluded.last_seen_at WHERE devices.app_version = 'legacy-import'").bind(token, language, now, now)
  )) : [];
  let addedOrReactivated = 0;
  let alreadyPresent = 0;
  for (const result of results) {
    if ((result.meta?.changes || 0) === 1) addedOrReactivated++;
    else alreadyPresent++;
  }
  return json(request, { received: data.devices.length, validUnique: rows.length, addedOrReactivated, alreadyPresent, reconciledInactive, invalid, duplicates });
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

function columnNumber(value) {
  const letters = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(letters)) return -1;
  return [...letters].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

async function importGoogleSheetTokens(request, env) {
  if (!await authorizedAdmin(request, env)) return json(request, { error: 'unauthorized_or_rate_limited' }, 401);
  const data = await readJson(request);
  const sheetUrl = String(data.sheetUrl || '').trim();
  let parsedUrl;
  try { parsedUrl = new URL(sheetUrl); } catch { return json(request, { error: 'invalid_google_sheet_url' }, 400); }
  const match = parsedUrl.hostname === 'docs.google.com' && parsedUrl.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{10,})\//);
  const gid = parsedUrl.searchParams.get('gid');
  const column = columnNumber(data.column || 'C');
  if (!match || !gid || !/^\d+$/.test(gid) || column < 0) return json(request, { error: 'invalid_google_sheet_url_or_column' }, 400);

  let csvText;
  try {
    const exportUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
    const sheetResponse = await fetch(exportUrl, { redirect: 'follow' });
    if (!sheetResponse.ok) return json(request, { error: 'google_sheet_not_public_or_unavailable', status: sheetResponse.status }, 400);
    csvText = await sheetResponse.text();
  } catch {
    return json(request, { error: 'google_sheet_fetch_failed' }, 502);
  }
  if (!csvText || csvText.length > 5 * 1024 * 1024 || /^\s*(?:<!doctype\s+html|<html)/i.test(csvText)) {
    return json(request, { error: 'google_sheet_not_public_or_invalid_csv' }, 400);
  }

  const tokenPattern = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,128}\]$/;
  const tokens = new Set();
  let invalid = 0;
  let duplicates = 0;
  for (const row of parseCsvRows(csvText)) {
    const token = String(row[column] || '').trim();
    if (!tokenPattern.test(token)) { invalid++; continue; }
    if (tokens.has(token)) { duplicates++; continue; }
    tokens.add(token);
  }
  const unique = [...tokens];
  if (data.preview === true) return json(request, { success: true, preview: true, sourceRows: parseCsvRows(csvText).length, validUnique: unique.length, invalid, duplicates });
  if (data.confirmImport !== true) return json(request, { error: 'import_confirmation_required' }, 400);
  if (!Number.isInteger(data.expectedValidUnique) || data.expectedValidUnique !== unique.length) return json(request, { error: 'sheet_changed_after_preview', validUnique: unique.length }, 409);

  const now = Date.now();
  let addedOrReactivated = 0;
  let alreadyPresent = 0;
  for (let start = 0; start < unique.length; start += 100) {
    const batchRows = unique.slice(start, start + 100);
    const results = await env.DB.batch(batchRows.map((token) =>
      env.DB.prepare("INSERT INTO devices (expo_token, language, app_version, platform, active, created_at, last_seen_at) VALUES (?, 'ar', 'legacy-import', 'unknown', 1, ?, ?) ON CONFLICT(expo_token) DO UPDATE SET language = excluded.language, active = 1, last_seen_at = excluded.last_seen_at WHERE devices.app_version = 'legacy-import'").bind(token, now, now)
    ));
    for (const result of results) {
      if ((result.meta?.changes || 0) === 1) addedOrReactivated++;
      else alreadyPresent++;
    }
  }
  return json(request, { success: true, preview: false, received: unique.length, validUnique: unique.length, addedOrReactivated, alreadyPresent, invalid, duplicates });
}

async function sendToExpo(env, notification, devices) {
  const now = Date.now();
  let accepted = 0;
  let errors = 0;
  for (let start = 0; start < devices.length; start += 100) {
    const chunk = devices.slice(start, start + 100);
    const messages = chunk.map((device) => ({
      to: device.expo_token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      priority: 'high',
      channelId: 'khmi-notifications',
      data: {
        ...(notification.data && typeof notification.data === 'object' ? notification.data : { type: 'cloudflare_notification' }),
        notificationId: notification.id,
        ...((notification.image_url || notification.imageUrl) ? { imageUrl: notification.image_url || notification.imageUrl } : {}),
      },
    }));
    const response = await fetch(EXPO_SEND_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(result.data)) {
      errors += chunk.length;
      continue;
    }
    for (let i = 0; i < result.data.length; i++) {
      const ticket = result.data[i];
      const device = chunk[i];
      if (ticket?.status === 'ok' && ticket.id) {
        accepted++;
        await env.DB.prepare('INSERT OR IGNORE INTO notification_receipts (ticket_id, notification_id, expo_token, submitted_at, status) VALUES (?, ?, ?, ?, ?)').bind(ticket.id, notification.id, device.expo_token, now, 'pending').run();
      } else {
        errors++;
        if (ticket?.details?.error === 'DeviceNotRegistered') {
          await env.DB.prepare('UPDATE devices SET active = 0, last_seen_at = ? WHERE expo_token = ?').bind(now, device.expo_token).run();
        }
      }
    }
  }
  return { accepted, errors };
}

async function sendNotification(env, notification) {
  const language = normalizeLanguage(notification.language);
  const targetFilter = notification.targetFilter || {};
  const conditions = ['active = 1'];
  const bindings = [];
  if (language !== 'all') {
    conditions.push('language = ?');
    bindings.push(language);
  }
  if (targetFilter.appVersion) {
    conditions.push('app_version = ?');
    bindings.push(targetFilter.appVersion);
  }
  if (Array.isArray(targetFilter.deviceKeys) && targetFilter.deviceKeys.length) {
    conditions.push(`expo_token IN (${targetFilter.deviceKeys.map(() => '?').join(',')})`);
    bindings.push(...targetFilter.deviceKeys);
  }
  const query = env.DB.prepare(`SELECT expo_token FROM devices WHERE ${conditions.join(' AND ')}`).bind(...bindings);
  const { results = [] } = await query.all();
  const stats = await sendToExpo(env, notification, results);
  const status = stats.errors === 0 ? 'sent' : (stats.accepted > 0 ? 'partial' : 'failed');
  await env.DB.prepare('UPDATE notifications SET status = ?, sent_at = ?, total_targets = ?, accepted_count = ?, error_count = ? WHERE id = ?').bind(status, Date.now(), results.length, stats.accepted, stats.errors, notification.id).run();
  return { status, totalTargets: results.length, acceptedByExpo: stats.accepted, errors: stats.errors };
}

const DEFAULT_USEFUL_BOTS = { whatsapp: true, facebook: true, telegram: true };
const DEFAULT_REMOTE_VISIBILITY = {
  lessons: {},
  bibleBooks: {},
  bibleTranslations: { ar: true, en: true, gr: true, he: true, cb: true, sy: true },
};
const DEFAULT_REMOTE_LABELS = {
  nav_home: '', nav_learn_coptic: '', nav_coptic_bible: '', nav_name_coptic: '', nav_training: '',
  nav_favorites: '', nav_history: '', nav_download: '', nav_about: '', about_desktop_download: '',
  button_home_favorites: '', button_search_filter: '', button_search_keyboard: '', button_search_clear: '',
  button_training_listening: '', button_training_handwriting: '', button_training_grammar_quiz: '',
  button_training_word_scramble: '', button_training_matching: '', button_training_stats: '',
  button_bible_scope_all: '', button_bible_scope_old: '', button_bible_scope_new: '',
  button_bible_scope_deuterocanonical: '', button_bible_scope_book: '', button_bible_layout_stacked: '',
  button_bible_layout_table: '', button_bible_export_word: '', button_bible_export_pptx: '',
  button_bible_export_pdf: '', button_bible_export_excel: '', button_bible_verse_download: '',
  button_bible_verse_copy: '', button_lesson_summary: '', button_lesson_training: '',
  button_lesson_exam: '', button_lesson_glossary: '', button_lesson_download: '',
  button_final_exam: '', button_get_certificate: '', button_about_share: '',
  button_about_suggestion: '', button_about_website: '', button_about_whatsapp_channel: '',
};
const DEFAULT_NOTIFICATION_SCHEDULE = {
  dailyWord: '00:40', copticMonth: '07:00', copticNewYear: '07:00',
  gregorianNewYear: '00:00', audioFirstDownload: '14:00', audioContinueDownload: '14:00',
};
const DEFAULT_REMOTE_CONTROLS = {
  nav_home: true,
  nav_learn_coptic: true, nav_coptic_bible: true, nav_name_coptic: true, nav_training: true,
  nav_favorites: true, nav_history: true, nav_download: true, nav_about: true,
  about_features: true, about_sources: true, about_social: true, about_bots: true,
  about_whatsapp_channel: true, about_suggestion: true, about_website: true, about_share: true, about_computer_download: true,
  link_social_facebook: true, link_social_whatsapp: true, link_social_telegram: true,
  link_bot_whatsapp: true, link_bot_facebook: true, link_bot_telegram_learning: true,
  link_bot_telegram_dictionary: true, link_whatsapp_channel: true,
  home_favorites_shortcut: true, home_connection_status: true, home_announcement: true,
  learn_intro_video: true, learn_letter_intro: true, learn_review_videos: true,
  learn_lesson_1: true, learn_lesson_2: true, learn_lesson_3: true,
  learn_lesson_4: true, learn_lesson_5: true, learn_lesson_6: true,
  learn_lesson_7: true, learn_lesson_8: true, learn_lesson_9: true,
  learn_summary_button: true, learn_oral_button: true, learn_exam_button: true,
  learn_glossary_button: true, learn_download_button: true,
  training_listening: true, training_handwriting: true, training_grammar_quiz: true,
  training_word_scramble: true, training_matching: true, training_stats: true,
  bible_old_testament: true, bible_new_testament: true, bible_deuterocanonical: true,
  drawer_dark_mode: true, drawer_language: true, drawer_contact_heading: true,
  drawer_social_section: true, drawer_admin_message: true, drawer_version_label: true,
  dictionary_filter_button: true, dictionary_coptic_keyboard: true, dictionary_result_counter: true,
  dictionary_result_audio: true, dictionary_secondary_meaning: true, dictionary_word_metadata: true,
  home_coptic_date_bar: true, bible_search: true, bible_translation_controls: true,
  bible_cross_references: true, bible_export_controls: true,
  dictionary_result_index: true, dictionary_meaning_count: true,
  dictionary_clear_query: true, dictionary_search_logo: true,
  bible_layout_modes: true, bible_verse_actions: true,
};
const DEFAULT_REMOTE_CONTENT = {
  announcementText: '', announcementTextAr: '', announcementTextEn: '', announcementTextFr: '', announcementTextDe: '',
  announcementStartsAt: '', announcementEndsAt: '',
  drawerMessage: '', drawerMessageAr: '', drawerMessageEn: '', drawerMessageFr: '', drawerMessageDe: '',
  appLatestVersion: '',
  appUpdateUrl: '', desktopDownloadUrl: '',
  appUpdateAdminOnly: 'false',
  appUpdateMode: 'sheet',
  appWhatsNewAr: '', appWhatsNewEn: '', appWhatsNewFr: '', appWhatsNewDe: '',
  dictionaryMaxResults: '5000', dictionaryMinSearchLength: '1', dictionarySortMode: 'source',
  dictionarySpreadsheet: '14pUNXtrHoMSU9lBWhKQZyspe-DDTMDudSiuL2sJQRUI',
  dictionarySheetName: 'dictionary',
  dictionaryColumnCoptic: 'A', dictionaryColumnArabic: 'C', dictionaryColumnEnglish: 'D',
  dictionaryColumnFrench: 'E', dictionaryColumnGerman: 'F', dictionaryColumnOrigin: 'J',
  dictionaryColumnWordType: 'K', dictionaryColumnAudio: 'L', dictionaryColumnGender: '',
  websiteUrl: 'https://copticdictionry.neocities.org/',
  socialFacebookUrl: 'https://www.facebook.com/profile.php?id=61574169939115',
  socialWhatsAppUrl: 'https://wa.me/201207829388', socialTelegramUrl: 'https://telegram.me/Abraam55',
  usefulBotsWhatsAppUrl: 'https://wa.me/201212270907',
  usefulBotsFacebookUrl: 'https://www.facebook.com/profile.php?id=61554907237871',
  usefulBotsTelegramLearningUrl: 'https://t.me/Coptic2_bot',
  usefulBotsTelegramDictionaryUrl: 'https://t.me/Coptic_Dictionary_bot',
  whatsappChannelUrl: 'https://whatsapp.com/channel/0029VameK2vFSAt7tXNIpm0m', brandColor: '#8B0000',
};

async function readAppSetting(env, key) {
  const row = await env.DB.prepare('SELECT value, updated_at FROM app_settings WHERE key = ?').bind(key).first();
  if (!row?.value) return { value: null, updatedAt: null };
  try { return { value: JSON.parse(row.value), updatedAt: row.updated_at || null }; }
  catch { return { value: null, updatedAt: row.updated_at || null }; }
}

async function getRemoteSettings(env) {
  const [bots, controls, visibility, content, labels, notificationSchedule] = await Promise.all([
    readAppSetting(env, 'useful_bots'), readAppSetting(env, 'app_controls'), readAppSetting(env, 'app_visibility'), readAppSetting(env, 'app_content'), readAppSetting(env, 'app_labels'), readAppSetting(env, 'notification_schedule'),
  ]);
  const normalizedVisibility = normalizeRemoteVisibility(visibility.value) || DEFAULT_REMOTE_VISIBILITY;
  return {
    usefulBots: { ...DEFAULT_USEFUL_BOTS, ...(bots.value || {}) },
    controls: { ...DEFAULT_REMOTE_CONTROLS, ...(controls.value || {}) },
    visibility: normalizedVisibility,
    content: { ...DEFAULT_REMOTE_CONTENT, ...(content.value || {}) },
    labels: { ...DEFAULT_REMOTE_LABELS, ...(labels.value || {}) },
    notificationSchedule: { ...DEFAULT_NOTIFICATION_SCHEDULE, ...(normalizeNotificationSchedule(notificationSchedule.value) || {}) },
    updatedAt: Math.max(bots.updatedAt || 0, controls.updatedAt || 0, visibility.updatedAt || 0, content.updatedAt || 0, labels.updatedAt || 0, notificationSchedule.updatedAt || 0) || null,
  };
}

function normalizeNotificationSchedule(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const normalized = {};
  for (const key of Object.keys(DEFAULT_NOTIFICATION_SCHEDULE)) {
    const time = value[key];
    if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
    normalized[key] = time;
  }
  return normalized;
}

function isSafeRemoteUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return true;
  try { return ['https:', 'http:'].includes(new URL(value).protocol); }
  catch { return false; }
}

function normalizeBooleanMap(value, keyPattern, maxEntries) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > maxEntries) return null;
  const normalized = {};
  for (const [key, enabled] of entries) {
    if (!keyPattern.test(key) || typeof enabled !== 'boolean') return null;
    normalized[key] = enabled;
  }
  return normalized;
}

function normalizeRemoteVisibility(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const lessons = normalizeBooleanMap(value.lessons, /^l[12]_[A-Za-z0-9_-]{1,90}$/, 250);
  const bibleBooks = normalizeBooleanMap(value.bibleBooks, /^(?:[1-9]|[1-9][0-9]{1,2})$/, 999);
  const bibleTranslations = normalizeBooleanMap(value.bibleTranslations, /^(?:ar|en|gr|he|cb|sy)$/, 6);
  if (!lessons || !bibleBooks || !bibleTranslations) return null;
  return { lessons, bibleBooks, bibleTranslations: { ...DEFAULT_REMOTE_VISIBILITY.bibleTranslations, ...bibleTranslations } };
}

async function settingsEndpoint(request, env, isAdmin) {
  if (isAdmin && !await authorizedAdmin(request, env)) return json(request, { error: 'unauthorized_or_rate_limited' }, 401);
  if (request.method === 'GET') return json(request, await getRemoteSettings(env));
  if (!isAdmin || request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405);
  const data = await readJson(request);
  const current = await getRemoteSettings(env);
  const next = { usefulBots: current.usefulBots, controls: current.controls, visibility: current.visibility, content: current.content, labels: current.labels, notificationSchedule: current.notificationSchedule };
  if (data.usefulBots !== undefined) {
    if (!data.usefulBots || typeof data.usefulBots !== 'object' || Object.keys(DEFAULT_USEFUL_BOTS).some((key) => typeof data.usefulBots[key] !== 'boolean')) return json(request, { error: 'invalid_useful_bots_settings' }, 400);
    next.usefulBots = Object.fromEntries(Object.keys(DEFAULT_USEFUL_BOTS).map((key) => [key, data.usefulBots[key]]));
  }
  if (data.controls !== undefined) {
    if (!data.controls || typeof data.controls !== 'object' || Object.keys(DEFAULT_REMOTE_CONTROLS).some((key) => typeof data.controls[key] !== 'boolean')) return json(request, { error: 'invalid_controls_settings' }, 400);
    next.controls = Object.fromEntries(Object.keys(DEFAULT_REMOTE_CONTROLS).map((key) => [key, data.controls[key]]));
  }
  if (data.labels !== undefined) {
    if (!data.labels || typeof data.labels !== 'object' || Array.isArray(data.labels) || Object.keys(data.labels).some((key) => !Object.prototype.hasOwnProperty.call(DEFAULT_REMOTE_LABELS, key))) return json(request, { error: 'invalid_labels_settings' }, 400);
    const labels = { ...DEFAULT_REMOTE_LABELS };
    for (const key of Object.keys(DEFAULT_REMOTE_LABELS)) {
      const value = data.labels[key];
      if (value !== undefined && (typeof value !== 'string' || value.length > 60)) return json(request, { error: 'invalid_label_value', field: key }, 400);
      if (value !== undefined) labels[key] = value.trim();
    }
    next.labels = labels;
  }
  if (data.notificationSchedule !== undefined) {
    const schedule = normalizeNotificationSchedule(data.notificationSchedule);
    if (!schedule) return json(request, { error: 'invalid_notification_schedule' }, 400);
    next.notificationSchedule = schedule;
  }
  if (data.visibility !== undefined) {
    const visibility = normalizeRemoteVisibility(data.visibility);
    if (!visibility) return json(request, { error: 'invalid_visibility_settings' }, 400);
    next.visibility = visibility;
  }
  if (data.content !== undefined) {
    if (!data.content || typeof data.content !== 'object') return json(request, { error: 'invalid_content_settings' }, 400);
    const content = { ...DEFAULT_REMOTE_CONTENT };
    for (const key of Object.keys(content)) {
      const value = data.content[key];
      if (value !== undefined && (typeof value !== 'string' || value.length > (key.endsWith('Url') ? 500 : 2000))) return json(request, { error: 'invalid_content_field', field: key }, 400);
      if (value !== undefined) content[key] = value.trim();
    }
    for (const key of Object.keys(content).filter((name) => name.endsWith('Url'))) {
      if (!isSafeRemoteUrl(content[key])) return json(request, { error: 'invalid_url', field: key }, 400);
    }
    if (content.appLatestVersion && !/^\d+\.\d+\.\d+$/.test(content.appLatestVersion)) return json(request, { error: 'invalid_app_version', field: 'appLatestVersion' }, 400);
    const columnFields = ['dictionaryColumnCoptic', 'dictionaryColumnArabic', 'dictionaryColumnEnglish', 'dictionaryColumnFrench', 'dictionaryColumnGerman', 'dictionaryColumnOrigin', 'dictionaryColumnWordType', 'dictionaryColumnAudio', 'dictionaryColumnGender'];
    if (!/^[1-9][0-9]{0,4}$/.test(content.dictionaryMaxResults) || Number(content.dictionaryMaxResults) > 10000) return json(request, { error: 'invalid_dictionary_max_results', field: 'dictionaryMaxResults' }, 400);
    if (!/^[1-5]$/.test(content.dictionaryMinSearchLength)) return json(request, { error: 'invalid_dictionary_min_search_length', field: 'dictionaryMinSearchLength' }, 400);
    if (!['source', 'coptic', 'meaning', 'audio'].includes(content.dictionarySortMode)) return json(request, { error: 'invalid_dictionary_sort_mode', field: 'dictionarySortMode' }, 400);
    if (!content.dictionarySheetName.trim() || content.dictionarySheetName.length > 100) return json(request, { error: 'invalid_dictionary_sheet_name', field: 'dictionarySheetName' }, 400);
    for (const key of columnFields) { if (content[key] && !/^[A-Z]{1,3}$/i.test(content[key])) return json(request, { error: 'invalid_dictionary_column', field: key }, 400); }
    if (!content.dictionaryColumnCoptic || !content.dictionaryColumnArabic) return json(request, { error: 'dictionary_coptic_and_arabic_columns_required' }, 400);
    if (content.dictionarySpreadsheet && !/^(?:[A-Za-z0-9_-]{10,}|https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+)/.test(content.dictionarySpreadsheet)) return json(request, { error: 'invalid_dictionary_spreadsheet', field: 'dictionarySpreadsheet' }, 400);
    if (!['true', 'false'].includes(content.appUpdateAdminOnly)) return json(request, { error: 'invalid_app_update_admin_only', field: 'appUpdateAdminOnly' }, 400);
    if (!['sheet', 'mandatory', 'optional'].includes(content.appUpdateMode)) return json(request, { error: 'invalid_app_update_mode', field: 'appUpdateMode' }, 400);
    if (content.brandColor && !/^#[0-9a-fA-F]{6}$/.test(content.brandColor)) return json(request, { error: 'invalid_brand_color' }, 400);
    for (const key of ['announcementStartsAt', 'announcementEndsAt']) {
      if (content[key] && !Number.isFinite(Date.parse(content[key]))) return json(request, { error: 'invalid_announcement_schedule', field: key }, 400);
    }
    next.content = content;
  }
  const now = Date.now();
  const updates = [];
  if (data.usefulBots !== undefined) updates.push(['useful_bots', next.usefulBots]);
  if (data.controls !== undefined) updates.push(['app_controls', next.controls]);
  if (data.visibility !== undefined) updates.push(['app_visibility', next.visibility]);
  if (data.content !== undefined) updates.push(['app_content', next.content]);
  if (data.labels !== undefined) updates.push(['app_labels', next.labels]);
  if (data.notificationSchedule !== undefined) updates.push(['notification_schedule', next.notificationSchedule]);
  if (!updates.length) return json(request, { error: 'no_settings_to_save' }, 400);
  const before = { usefulBots: current.usefulBots, controls: current.controls, visibility: current.visibility, content: current.content, labels: current.labels, notificationSchedule: current.notificationSchedule };
  const { value: oldHistory } = await readAppSetting(env, 'control_history');
  const history = Array.isArray(oldHistory) ? oldHistory : [];
  history.unshift({ at: now, changed: updates.map(([key]) => key), before, after: next });
  const batch = updates.map(([key, value]) => env.DB.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(key, JSON.stringify(value), now));
  batch.push(env.DB.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (\'control_history\', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(JSON.stringify(history.slice(0, 30)), now));
  await env.DB.batch(batch);
  return json(request, { success: true, ...next, updatedAt: now });
}

async function settingsHistory(request, env) {
  if (!await authorizedAdmin(request, env)) return json(request, { error: 'unauthorized_or_rate_limited' }, 401);
  const { value } = await readAppSetting(env, 'control_history');
  return json(request, { history: Array.isArray(value) ? value : [] });
}

async function adminSend(request, env) {
  if (!await authorizedAdmin(request, env)) return json(request, { error: 'unauthorized_or_rate_limited' }, 401);
  const data = await readJson(request);
  const title = String(data.title || '').trim();
  const body = String(data.body || '').trim();
  const language = normalizeLanguage(data.language);
  if (!title || title.length > 120 || !body || body.length > 4000) return json(request, { error: 'invalid_title_or_body' }, 400);
  const imageUrl = normalizeNotificationImageUrl(data.imageUrl);
  if (imageUrl === null) return json(request, { error: 'image_url_must_be_a_valid_https_url' }, 400);
  const rawFilter = data.targetFilter && typeof data.targetFilter === 'object' ? data.targetFilter : {};
  const rawDeviceKeys = Array.isArray(rawFilter.deviceKeys) ? rawFilter.deviceKeys : [];
  if (rawDeviceKeys.length > 200) return json(request, { error: 'too_many_device_keys' }, 400);
  const tokenPattern = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,128}\]$/;
  const deviceKeys = [...new Set(rawDeviceKeys.map((key) => String(key).trim()))];
  if (deviceKeys.some((key) => !tokenPattern.test(key))) return json(request, { error: 'invalid_device_key' }, 400);
  const targetFilter = {
    appVersion: String(rawFilter.appVersion || '').trim().slice(0, 40),
    deviceKeys,
  };
  const id = crypto.randomUUID();
  const now = Date.now();
  if (imageUrl) {
    const samplePayload = JSON.stringify({ to: `ExponentPushToken[${'x'.repeat(128)}]`, sound: 'default', title, body, priority: 'high', channelId: 'khmi-notifications', data: { type: 'cloudflare_notification', notificationId: id, imageUrl } });
    if (new TextEncoder().encode(samplePayload).length > 3800) return json(request, { error: 'notification_payload_too_large_with_image' }, 400);
  }
  let scheduledAt = null;
  if (data.scheduledAt) {
    const parsed = Date.parse(data.scheduledAt);
    if (!Number.isFinite(parsed) || parsed < now + 30_000) return json(request, { error: 'scheduled_time_must_be_at_least_30_seconds_in_the_future' }, 400);
    scheduledAt = parsed;
  }
  await env.DB.prepare('INSERT INTO notifications (id, title, body, image_url, language, scheduled_at, status, created_at, target_filter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, title, body, imageUrl, language, scheduledAt, scheduledAt ? 'scheduled' : 'sending', now, JSON.stringify(targetFilter)).run();
  if (scheduledAt) return json(request, { notificationId: id, status: 'scheduled', scheduledAt: new Date(scheduledAt).toISOString() }, 202);
  const result = await sendNotification(env, { id, title, body, imageUrl, language, targetFilter });
  return json(request, { notificationId: id, ...result });
}


function compareAppVersions(left, right) {
  const a = String(left || '').split('.').map((part) => Number(part) || 0);
  const b = String(right || '').split('.').map((part) => Number(part) || 0);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return 1;
    if ((a[i] || 0) < (b[i] || 0)) return -1;
  }
  return 0;
}

async function publishAppUpdate(request, env) {
  if (!await authorizedAdmin(request, env)) return json(request, { error: 'unauthorized_or_rate_limited' }, 401);
  const settings = await getRemoteSettings(env);
  const content = settings.content;
  const version = String(content.appLatestVersion || '').trim();
  const updateUrl = String(content.appUpdateUrl || '').trim();
  const adminOnly = content.appUpdateAdminOnly === 'true';
  if (!version || !/^\d+\.\d+\.\d+$/.test(version) || !updateUrl || !isSafeRemoteUrl(updateUrl)) {
    return json(request, { error: 'valid_app_version_and_update_url_required' }, 400);
  }
  const body = await readJson(request);
  const adminToken = String(body.adminExpoToken || '').trim();
  const tokenPattern = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,128}\]$/;
  if (adminOnly && !tokenPattern.test(adminToken)) {
    return json(request, { error: 'admin_device_push_token_required' }, 400);
  }

  const now = Date.now();
  const audience = adminOnly ? 'publisher_admin_device' : 'all_outdated_devices';
  const claim = await env.DB.prepare('INSERT OR IGNORE INTO app_update_pushes (version, started_at, audience) VALUES (?, ?, ?)').bind(version, now, audience).run();
  if ((claim.meta?.changes || 0) !== 1) {
    const existing = await env.DB.prepare('SELECT target_count, accepted_count, error_count, audience FROM app_update_pushes WHERE version = ?').bind(version).first();
    return json(request, { status: 'already_processed', version, ...existing });
  }

  const notificationId = `app-update-${version}`;
  const title = 'تحديث جديد للتطبيق';
  const message = `يتوفر الإصدار ${version}. اضغط لتنزيل التحديث.`;
  await env.DB.prepare("INSERT INTO notifications (id, title, body, language, status, created_at, target_filter) VALUES (?, ?, ?, 'all', 'sending', ?, ?)")
    .bind(notificationId, title, message, now, JSON.stringify({ appUpdateVersion: version, audience })).run();

  const { results = [] } = await env.DB.prepare('SELECT expo_token, app_version FROM devices WHERE active = 1').all();
  const recipients = results.filter((device) => {
    if (adminOnly && device.expo_token !== adminToken) return false;
    // Unknown/legacy versions are conservatively considered outdated.
    if (!/^\d+\.\d+\.\d+$/.test(String(device.app_version || ''))) return true;
    return compareAppVersions(device.app_version, version) < 0;
  });
  const notification = {
    id: notificationId,
    title,
    body: message,
    language: 'all',
    data: { type: 'update', version, updateUrl, adminOnly },
  };
  const stats = await sendToExpo(env, notification, recipients);
  const status = stats.errors === 0 ? 'sent' : (stats.accepted > 0 ? 'partial' : 'failed');
  await env.DB.batch([
    env.DB.prepare('UPDATE notifications SET status = ?, sent_at = ?, total_targets = ?, accepted_count = ?, error_count = ? WHERE id = ?')
      .bind(status, Date.now(), recipients.length, stats.accepted, stats.errors, notificationId),
    env.DB.prepare('UPDATE app_update_pushes SET sent_at = ?, target_count = ?, accepted_count = ?, error_count = ? WHERE version = ?')
      .bind(Date.now(), recipients.length, stats.accepted, stats.errors, version),
  ]);
  return json(request, { status, version, audience, totalTargets: recipients.length, acceptedByExpo: stats.accepted, errors: stats.errors });
}

const BIBLE_LANGUAGES = new Set(['ar', 'en', 'gr', 'he', 'cb', 'sy', '*']);
function bibleCoordinate(value, max = 999) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= max ? number : null;
}
function validateBibleChange(row) {
  const book = bibleCoordinate(row?.book, 999);
  const chapter = bibleCoordinate(row?.chapter, 999);
  const verse = bibleCoordinate(row?.verse, 999);
  const language = String(row?.language || '');
  if (!book || !chapter || !verse || !BIBLE_LANGUAGES.has(language) || (language === '*' && row?.deleted !== true)) throw new Error('invalid_bible_reference');
  const text = String(row?.text ?? '');
  const deleted = row?.deleted === true;
  if (!deleted && !text.trim()) throw new Error('bible_verse_text_required');
  if (text.length > 10000) throw new Error('bible_verse_text_too_long');
  return { book, chapter, verse, language, text, deleted };
}
async function publicBibleChapter(request, env) {
  const url = new URL(request.url);
  const book = bibleCoordinate(url.searchParams.get('book'), 999);
  const chapter = bibleCoordinate(url.searchParams.get('chapter'), 999);
  if (!book || !chapter) return json(request, { error: 'invalid_bible_reference' }, 400);
  const { results = [] } = await env.DB.prepare('SELECT book_id AS book, chapter, verse, language, text, deleted, updated_at AS updatedAt FROM bible_verse_overrides WHERE book_id = ? AND chapter = ? ORDER BY verse, language').bind(book, chapter).all();
  return json(request, { book, chapter, overrides: results, updatedAt: results.reduce((max, row) => Math.max(max, Number(row.updatedAt || 0)), 0) });
}
async function publicBibleBook(request, env) {
  const url = new URL(request.url);
  const book = bibleCoordinate(url.searchParams.get('book'), 999);
  if (!book) return json(request, { error: 'invalid_bible_book' }, 400);
  const language = url.searchParams.get('language');
  const result = language && BIBLE_LANGUAGES.has(language) && language !== '*'
    ? await env.DB.prepare("SELECT book_id AS book, chapter, verse, language, text, deleted, updated_at AS updatedAt FROM bible_verse_overrides WHERE book_id = ? AND language IN (?, '*') ORDER BY chapter, verse, language").bind(book, language).all()
    : await env.DB.prepare('SELECT book_id AS book, chapter, verse, language, text, deleted, updated_at AS updatedAt FROM bible_verse_overrides WHERE book_id = ? ORDER BY chapter, verse, language').bind(book).all();
  const results = result.results || [];
  return json(request, { book, overrides: results, updatedAt: results.reduce((max, row) => Math.max(max, Number(row.updatedAt || 0)), 0) });
}
async function publicBibleBooks(request, env) {
  const { results = [] } = await env.DB.prepare('SELECT book_id AS id, meta_json AS metaJson, deleted, updated_at AS updatedAt FROM bible_book_overrides ORDER BY book_id').all();
  const books = [];
  for (const row of results) {
    try { books.push({ ...JSON.parse(row.metaJson), id: Number(row.id), deleted: Boolean(row.deleted), updatedAt: Number(row.updatedAt || 0) }); } catch {}
  }
  return json(request, { books, updatedAt: books.reduce((max, row) => Math.max(max, row.updatedAt || 0), 0) });
}
async function adminBibleChanges(request, env) {
  if (!await authorizedAdmin(request, env)) return json(request, { error: 'unauthorized_or_rate_limited' }, 401);
  const data = await readJson(request);
  if (!Array.isArray(data.changes) || !data.changes.length || data.changes.length > 500) return json(request, { error: 'bible_changes_must_be_1_to_500' }, 400);
  const changes = data.changes.map(validateBibleChange);
  const unique = new Set(changes.map((item) => `${item.book}:${item.chapter}:${item.verse}:${item.language}`));
  if (unique.size !== changes.length) return json(request, { error: 'duplicate_bible_reference_in_batch' }, 400);
  const snapshots = [];
  for (const item of changes) {
    const before = await env.DB.prepare('SELECT book_id AS book, chapter, verse, language, text, deleted, updated_at AS updatedAt FROM bible_verse_overrides WHERE book_id = ? AND chapter = ? AND verse = ? AND language = ?').bind(item.book, item.chapter, item.verse, item.language).first();
    snapshots.push({ before: before || null, after: item });
  }
  const now = Date.now();
  const statements = changes.map((item) => env.DB.prepare('INSERT INTO bible_verse_overrides (book_id, chapter, verse, language, text, deleted, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(book_id, chapter, verse, language) DO UPDATE SET text = excluded.text, deleted = excluded.deleted, updated_at = excluded.updated_at').bind(item.book, item.chapter, item.verse, item.language, item.text, item.deleted ? 1 : 0, now));
  const historyId = crypto.randomUUID();
  statements.push(env.DB.prepare('INSERT INTO bible_edit_history (id, kind, changes_json, created_at) VALUES (?, ?, ?, ?)').bind(historyId, 'verses', JSON.stringify(snapshots), now));
  await env.DB.batch(statements);
  return json(request, { success: true, historyId, changed: changes.length, updatedAt: now });
}
function validateBibleBook(meta) {
  const id = bibleCoordinate(meta?.id, 999);
  const testament = String(meta?.testament || 'custom');
  if (!id || !['old', 'new', 'deutero', 'custom'].includes(testament)) throw new Error('invalid_bible_book');
  const clean = { id, testament, order: bibleCoordinate(meta?.order || id, 999), hidden: meta?.hidden === true };
  for (const key of ['titleAr', 'titleEn', 'titleFr', 'titleDe', 'titleCoptic']) {
    clean[key] = String(meta?.[key] || '').trim().slice(0, 120);
  }
  if (!clean.titleAr && !clean.titleEn) throw new Error('bible_book_title_required');
  return clean;
}
async function adminBibleBook(request, env) {
  if (!await authorizedAdmin(request, env)) return json(request, { error: 'unauthorized_or_rate_limited' }, 401);
  const data = await readJson(request);
  const meta = validateBibleBook(data.book);
  const before = await env.DB.prepare('SELECT book_id AS id, meta_json AS metaJson, deleted, updated_at AS updatedAt FROM bible_book_overrides WHERE book_id = ?').bind(meta.id).first();
  const old = before ? { ...JSON.parse(before.metaJson), id: Number(before.id), deleted: Boolean(before.deleted), updatedAt: before.updatedAt } : null;
  const deleted = data.deleted === true;
  const now = Date.now();
  const historyId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO bible_book_overrides (book_id, meta_json, deleted, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(book_id) DO UPDATE SET meta_json = excluded.meta_json, deleted = excluded.deleted, updated_at = excluded.updated_at').bind(meta.id, JSON.stringify(meta), deleted ? 1 : 0, now),
    env.DB.prepare('INSERT INTO bible_edit_history (id, kind, changes_json, created_at) VALUES (?, ?, ?, ?)').bind(historyId, 'book', JSON.stringify([{ before: old, after: { ...meta, deleted } }]), now),
  ]);
  return json(request, { success: true, historyId, book: { ...meta, deleted }, updatedAt: now });
}
async function adminBibleHistory(request, env) {
  if (!await authorizedAdmin(request, env)) return json(request, { error: 'unauthorized_or_rate_limited' }, 401);
  const { results = [] } = await env.DB.prepare('SELECT id, kind, created_at AS createdAt, undone_at AS undoneAt, changes_json AS changesJson FROM bible_edit_history ORDER BY created_at DESC LIMIT 500').all();
  return json(request, { history: results.map((row) => {
    let changes = []; try { changes = JSON.parse(row.changesJson || '[]'); } catch {}
    return { id: row.id, kind: row.kind, createdAt: row.createdAt, undoneAt: row.undoneAt, count: changes.length };
  }) });
}
async function adminBibleUndo(request, env) {
  if (!await authorizedAdmin(request, env)) return json(request, { error: 'unauthorized_or_rate_limited' }, 401);
  const data = await readJson(request);
  const id = String(data.id || '');
  const row = await env.DB.prepare('SELECT id, kind, changes_json AS changesJson, undone_at AS undoneAt FROM bible_edit_history WHERE id = ?').bind(id).first();
  if (!row) return json(request, { error: 'bible_history_not_found' }, 404);
  if (row.undoneAt) return json(request, { error: 'bible_change_already_undone' }, 409);
  const changes = JSON.parse(row.changesJson || '[]');
  const statements = [];
  const now = Date.now();
  for (const snapshot of changes) {
    if (row.kind === 'book') {
      const after = snapshot.after;
      if (snapshot.before) statements.push(env.DB.prepare('INSERT INTO bible_book_overrides (book_id, meta_json, deleted, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(book_id) DO UPDATE SET meta_json = excluded.meta_json, deleted = excluded.deleted, updated_at = excluded.updated_at').bind(snapshot.before.id, JSON.stringify(snapshot.before), snapshot.before.deleted ? 1 : 0, now));
      else statements.push(env.DB.prepare('DELETE FROM bible_book_overrides WHERE book_id = ?').bind(after.id));
    } else {
      const after = snapshot.after;
      if (snapshot.before) statements.push(env.DB.prepare('INSERT INTO bible_verse_overrides (book_id, chapter, verse, language, text, deleted, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(book_id, chapter, verse, language) DO UPDATE SET text = excluded.text, deleted = excluded.deleted, updated_at = excluded.updated_at').bind(snapshot.before.book, snapshot.before.chapter, snapshot.before.verse, snapshot.before.language, snapshot.before.text, snapshot.before.deleted ? 1 : 0, now));
      else statements.push(env.DB.prepare('DELETE FROM bible_verse_overrides WHERE book_id = ? AND chapter = ? AND verse = ? AND language = ?').bind(after.book, after.chapter, after.verse, after.language));
    }
  }
  statements.push(env.DB.prepare('UPDATE bible_edit_history SET undone_at = ? WHERE id = ? AND undone_at IS NULL').bind(now, id));
  await env.DB.batch(statements);
  return json(request, { success: true, undone: id, updatedAt: now });
}

async function processScheduled(env) {
  const now = Date.now();
  const { results = [] } = await env.DB.prepare("SELECT id, title, body, image_url, language, target_filter FROM notifications WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 10").bind(now).all();
  for (const notification of results) {
    const claim = await env.DB.prepare("UPDATE notifications SET status = 'sending' WHERE id = ? AND status = 'scheduled'").bind(notification.id).run();
    if ((claim.meta?.changes || 0) !== 1) continue;
    try { await sendNotification(env, { ...notification, targetFilter: JSON.parse(notification.target_filter || '{}') }); }
    catch (error) {
      await env.DB.prepare("UPDATE notifications SET status = 'failed', sent_at = ?, error_count = 1 WHERE id = ?").bind(Date.now(), notification.id).run();
      console.error('Scheduled notification failed', notification.id, error?.message || error);
    }
  }
}

async function processReceipts(env) {
  const olderThan = Date.now() - 10 * 60 * 1000;
  const { results = [] } = await env.DB.prepare("SELECT ticket_id, expo_token FROM notification_receipts WHERE status = 'pending' AND submitted_at <= ? ORDER BY submitted_at LIMIT 100").bind(olderThan).all();
  for (let start = 0; start < results.length; start += 100) {
    const chunk = results.slice(start, start + 100);
    if (!chunk.length) continue;
    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: chunk.map((row) => row.ticket_id) }),
    });
    if (!response.ok) continue;
    const result = await response.json().catch(() => ({}));
    const receipts = result.data || {};
    for (const row of chunk) {
      const receipt = receipts[row.ticket_id];
      if (!receipt) continue;
      const status = receipt.status === 'ok' ? 'ok' : 'error';
      const error = receipt.details?.error || receipt.message || null;
      await env.DB.prepare('UPDATE notification_receipts SET status = ?, checked_at = ?, error = ? WHERE ticket_id = ?').bind(status, Date.now(), error, row.ticket_id).run();
      if (error === 'DeviceNotRegistered') await env.DB.prepare('UPDATE devices SET active = 0, last_seen_at = ? WHERE expo_token = ?').bind(Date.now(), row.expo_token).run();
    }
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/v1/bible/chapter') return await publicBibleChapter(request, env);
      if (request.method === 'GET' && url.pathname === '/v1/bible/book') return await publicBibleBook(request, env);
      if (request.method === 'GET' && url.pathname === '/v1/bible/books') return await publicBibleBooks(request, env);
      if (request.method === 'POST' && url.pathname === '/admin/bible/changes') return await adminBibleChanges(request, env);
      if (request.method === 'POST' && url.pathname === '/admin/bible/book') return await adminBibleBook(request, env);
      if (request.method === 'GET' && url.pathname === '/admin/bible/history') return await adminBibleHistory(request, env);
      if (request.method === 'POST' && url.pathname === '/admin/bible/undo') return await adminBibleUndo(request, env);
      if (request.method === 'GET' && url.pathname.startsWith('/media/')) return await serveNotificationImage(request, env);
      if (request.method === 'GET' && url.pathname === '/health') {
        await env.DB.prepare('SELECT 1').first();
        return json(request, { ok: true, service: 'coptic-app-notifications' });
      }
      if (request.method === 'GET' && url.pathname === '/admin') {
        const headers = corsHeaders(request); headers.set('Content-Type', 'text/html; charset=utf-8'); headers.set('Cache-Control', 'no-store');
        return new Response(ADMIN_HTML, { headers });
      }
      if (url.pathname === '/v1/settings' && request.method === 'GET') return await settingsEndpoint(request, env, false);
      if (url.pathname === '/admin/settings' && (request.method === 'GET' || request.method === 'POST')) return await settingsEndpoint(request, env, true);
      if (url.pathname === '/admin/settings/history' && request.method === 'GET') return await settingsHistory(request, env);
      if (request.method === 'POST' && url.pathname === '/admin/app-login') return await adminAppLogin(request, env);
      if (request.method === 'POST' && url.pathname === '/admin/login') return await adminLogin(request, env);
      if (request.method === 'GET' && url.pathname === '/admin/devices') return await adminDevices(request, env);
      if (request.method === 'GET' && url.pathname === '/admin/notifications') return await adminNotificationHistory(request, env);
      if (request.method === 'GET' && url.pathname === '/admin/versions') return await adminVersionBreakdown(request, env);
      if (request.method === 'POST' && url.pathname === '/v1/register') return await registerDevice(request, env);
      if (request.method === 'POST' && url.pathname === '/admin/import-legacy') return await importLegacyDevices(request, env);
      if (request.method === 'POST' && url.pathname === '/admin/import-google-sheet-tokens') return await importGoogleSheetTokens(request, env);
      if (request.method === 'POST' && url.pathname === '/admin/send') return await adminSend(request, env);
      if (request.method === 'POST' && url.pathname === '/admin/media') return await adminUploadNotificationImage(request, env);
      if (request.method === 'POST' && url.pathname === '/admin/app-update/publish') return await publishAppUpdate(request, env);
      return json(request, { error: 'not_found' }, 404);
    } catch (error) {
      const message = error?.message || 'internal_error';
      const status = message === 'request_too_large' ? 413 : (message === 'invalid_json' ? 400 : 500);
      console.error('Request failed', url.pathname, message);
      return json(request, { error: message }, status);
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(Promise.all([processScheduled(env), processReceipts(env)]));
  },
};
