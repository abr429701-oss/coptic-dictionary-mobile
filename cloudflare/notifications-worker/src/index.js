const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_BODY_BYTES = 16 * 1024;

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
  const { results = [] } = await env.DB.prepare('SELECT id, title, language, status, scheduled_at, created_at, sent_at, total_targets, accepted_count, error_count, target_filter FROM notifications ORDER BY created_at DESC LIMIT ?').bind(limit).all();
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
      data: { type: 'cloudflare_notification', notificationId: notification.id },
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

async function adminSend(request, env) {
  if (!await authorizedAdmin(request, env)) return json(request, { error: 'unauthorized_or_rate_limited' }, 401);
  const data = await readJson(request);
  const title = String(data.title || '').trim();
  const body = String(data.body || '').trim();
  const language = normalizeLanguage(data.language);
  if (!title || title.length > 120 || !body || body.length > 4000) return json(request, { error: 'invalid_title_or_body' }, 400);
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
  let scheduledAt = null;
  if (data.scheduledAt) {
    const parsed = Date.parse(data.scheduledAt);
    if (!Number.isFinite(parsed) || parsed < now + 30_000) return json(request, { error: 'scheduled_time_must_be_at_least_30_seconds_in_the_future' }, 400);
    scheduledAt = parsed;
  }
  await env.DB.prepare('INSERT INTO notifications (id, title, body, language, scheduled_at, status, created_at, target_filter) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, title, body, language, scheduledAt, scheduledAt ? 'scheduled' : 'sending', now, JSON.stringify(targetFilter)).run();
  if (scheduledAt) return json(request, { notificationId: id, status: 'scheduled', scheduledAt: new Date(scheduledAt).toISOString() }, 202);
  const result = await sendNotification(env, { id, title, body, language, targetFilter });
  return json(request, { notificationId: id, ...result });
}

async function processScheduled(env) {
  const now = Date.now();
  const { results = [] } = await env.DB.prepare("SELECT id, title, body, language, target_filter FROM notifications WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 10").bind(now).all();
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
      if (request.method === 'GET' && url.pathname === '/health') {
        await env.DB.prepare('SELECT 1').first();
        return json(request, { ok: true, service: 'coptic-app-notifications' });
      }
      if (request.method === 'GET' && url.pathname === '/admin') {
        const headers = corsHeaders(request); headers.set('Content-Type', 'text/html; charset=utf-8'); headers.set('Cache-Control', 'no-store');
        return new Response(ADMIN_HTML, { headers });
      }
      if (request.method === 'POST' && url.pathname === '/admin/app-login') return await adminAppLogin(request, env);
      if (request.method === 'POST' && url.pathname === '/admin/login') return await adminLogin(request, env);
      if (request.method === 'GET' && url.pathname === '/admin/devices') return await adminDevices(request, env);
      if (request.method === 'GET' && url.pathname === '/admin/notifications') return await adminNotificationHistory(request, env);
      if (request.method === 'GET' && url.pathname === '/admin/versions') return await adminVersionBreakdown(request, env);
      if (request.method === 'POST' && url.pathname === '/v1/register') return await registerDevice(request, env);
      if (request.method === 'POST' && url.pathname === '/admin/import-legacy') return await importLegacyDevices(request, env);
      if (request.method === 'POST' && url.pathname === '/admin/send') return await adminSend(request, env);
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
