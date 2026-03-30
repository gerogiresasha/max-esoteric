const prompts = require("./prompts");
const crypto = require("crypto");

const YC_COMPLETION_URL =
  "https://llm.api.cloud.yandex.net/v1/chat/completions";

const YUKASSA_API_URL = "https://api.yookassa.ru/v3/payments";
const MAX_API_URL = "https://platform-api.max.ru";
const YOS_API_URL = "https://storage.yandexcloud.net";
const MOSCOW_TIMEZONE = "Europe/Moscow";
const INSTRUMENT_PRICES = {
  compatibility: 14900,
  tarot: 9900,
  numerology: 9900,
  dreambook: 9900,
};
const payments = new Map(); // хранилище статусов в памяти
const ANALYTICS_INSTRUMENTS = ["compatibility", "tarot", "numerology", "dreambook"];
const ANALYTICS_TIERS = ["free", "paid"];
const ANALYTICS_PAGES = new Set(ANALYTICS_INSTRUMENTS);
const ANALYTICS_EVENT_TYPES = new Set([
  "session_start",
  "page_view",
  "reading_complete",
  "payment_init",
  "share",
  "session_end",
]);

function getHeader(headers, name) {
  if (!headers || typeof headers !== "object") return "";
  const target = String(name || "").toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === target) return asString(v);
  }
  return "";
}

function isMaxUpdateBody(body) {
  return (
    body &&
    typeof body === "object" &&
    typeof body.update_type === "string" &&
    body.update_type.trim().length > 0
  );
}

async function maxApiRequest(path, { token, method = "GET", body } = {}) {
  if (!token) throw new Error("MAX_BOT_TOKEN не задан");
  const url = `${MAX_API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await resp.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!resp.ok) {
    const msg =
      json?.message ||
      json?.error ||
      (text && text.length < 2000 ? text : "") ||
      `MAX API HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return json;
}

async function getBotUsername(token) {
  const me = await maxApiRequest("/me", { token, method: "GET" });
  const username = asString(me?.username).trim();
  return username || "";
}

function buildStartAppLink(botUsername) {
  const u = asString(botUsername).trim().replace(/^@/, "");
  if (!u) return "";
  return `https://max.ru/${encodeURIComponent(u)}?startapp`;
}

async function sendBotMessage({ token, userId, chatId, text, attachments } = {}) {
  const targetUserId = asString(userId).trim();
  const targetChatId = asString(chatId).trim();
  if (!targetUserId && !targetChatId) return;

  const payload = {
    text: asString(text).trim(),
  };
  if (Array.isArray(attachments) && attachments.length > 0) {
    payload.attachments = attachments;
  }

  const query = targetChatId
    ? `chat_id=${encodeURIComponent(targetChatId)}`
    : `user_id=${encodeURIComponent(targetUserId)}`;

  await maxApiRequest(`/messages?${query}`, {
    token,
    method: "POST",
    body: payload,
  });
}

async function sendWelcome({ token, userId, chatId, user }) {
  const targetUserId = asString(userId).trim();
  const targetChatId = asString(chatId).trim();
  if (!targetUserId && !targetChatId) return;

  const userName =
    asString(user?.first_name).trim() ||
    asString(user?.name).trim() ||
    "друг";

  let startAppLink = "";
  try {
    const botUsername = await getBotUsername(token);
    startAppLink = buildStartAppLink(botUsername);
  } catch {
    // ignore
  }

  const appFallback = "https://gerogiresasha.github.io/max-esoteric/";
  const link = startAppLink || appFallback;

  const text =
    `Привет, ${userName}!\n\n` +
    `Нажми кнопку «Открыть» внизу чата — там 4 расклада: ` +
    `Совместимость, Карта дня, Имя и Сонник.\n\n` +
    `Если кнопки не видно — открой ссылку: ${link}`;
  await sendBotMessage({
    token,
    userId: targetUserId,
    chatId: targetChatId,
    text,
    attachments: [
      {
        type: "inline_keyboard",
        payload: {
          buttons: [[{ type: "link", text: "Открыть", url: link }]],
        },
      },
    ],
  });
}

function getMoscowDateParts(date) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: MOSCOW_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }
  }
  return parts;
}

function toMoscowIso(date) {
  const parts = getMoscowDateParts(date);
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${ms}+03:00`;
}

function toMoscowDate(date) {
  const parts = getMoscowDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asString(ymd).trim());
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
  };
}

function shiftYmd(ymd, days) {
  const parsed = parseYmd(ymd);
  if (!parsed) return "";
  const d = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  const year = String(d.getUTCFullYear());
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function enumerateYmdRange(startYmd, endYmd) {
  if (!startYmd || !endYmd) return [];
  const result = [];
  let current = startYmd;
  while (current && current <= endYmd) {
    result.push(current);
    current = shiftYmd(current, 1);
  }
  return result;
}

function formatRuDate(ymd) {
  const parsed = parseYmd(ymd);
  if (!parsed) return ymd;
  return `${String(parsed.day).padStart(2, "0")}.${String(parsed.month).padStart(2, "0")}.${parsed.year}`;
}

function formatDuration(sec) {
  const total = Math.max(0, Math.round(Number(sec) || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes <= 0) return `${seconds} сек`;
  return `${minutes} мин ${seconds} сек`;
}

function roundTo(value, digits) {
  return Number(Number(value || 0).toFixed(digits));
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value;
  const s = asString(value).trim().toLowerCase();
  if (!s) return false;
  return ["1", "true", "yes", "y", "on"].includes(s);
}

function parseDateSafe(value) {
  const raw = asString(value).trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sanitizeSource(value) {
  const source = asString(value).trim();
  return source || "direct";
}

function createInstrumentCounters() {
  return {
    compatibility: { free: 0, paid: 0 },
    tarot: { free: 0, paid: 0 },
    numerology: { free: 0, paid: 0 },
    dreambook: { free: 0, paid: 0 },
  };
}

function createShareCounters() {
  return {
    compatibility: 0,
    tarot: 0,
    numerology: 0,
    dreambook: 0,
  };
}

function normalizeAnalyticsEvent(input) {
  if (!input || typeof input !== "object") return null;

  const eventType = asString(input?.event_type).trim();
  if (!ANALYTICS_EVENT_TYPES.has(eventType)) return null;

  const tsDate = parseDateSafe(input?.timestamp) || new Date();
  const event = {
    event_type: eventType,
    user_id: asString(input?.user_id).trim() || "anonymous",
    timestamp: tsDate.toISOString(),
    source: sanitizeSource(input?.source),
    is_max: normalizeBoolean(input?.is_max),
  };

  if (eventType === "session_start") {
    event.referrer = asString(input?.referrer).trim();
    event.is_new_user = normalizeBoolean(input?.is_new_user);
  }

  if (eventType === "page_view") {
    const page = asString(input?.page).trim();
    if (!ANALYTICS_PAGES.has(page)) return null;
    event.page = page;
  }

  if (eventType === "reading_complete") {
    const instrument = asString(input?.instrument).trim();
    const tier = asString(input?.tier).trim();
    if (!ANALYTICS_PAGES.has(instrument) || !ANALYTICS_TIERS.includes(tier)) {
      return null;
    }
    event.instrument = instrument;
    event.tier = tier;
  }

  if (eventType === "payment_init" || eventType === "share") {
    const instrument = asString(input?.instrument).trim();
    if (!ANALYTICS_PAGES.has(instrument)) return null;
    event.instrument = instrument;
  }

  if (eventType === "session_end") {
    const duration = Number(input?.duration_seconds);
    const rawPages = Array.isArray(input?.pages_visited) ? input.pages_visited : [];
    const pages = rawPages
      .map((page) => asString(page).trim())
      .filter((page) => ANALYTICS_PAGES.has(page));
    event.duration_seconds =
      Number.isFinite(duration) && duration >= 0 ? Math.round(duration) : 0;
    event.pages_visited = Array.from(new Set(pages));
  }

  return event;
}

function getAnalyticsEnv() {
  return {
    accessKey: asString(process.env.YOS_ACCESS_KEY).trim(),
    secretKey: asString(process.env.YOS_SECRET_KEY).trim(),
    bucket: asString(process.env.YOS_BUCKET).trim(),
    region: asString(process.env.YOS_REGION).trim() || "ru-central1",
  };
}

function ensureAnalyticsStorageEnv() {
  const env = getAnalyticsEnv();
  if (!env.accessKey || !env.secretKey || !env.bucket) {
    throw new Error("Не заданы YOS_ACCESS_KEY / YOS_SECRET_KEY / YOS_BUCKET в env");
  }
  return env;
}

function requireS3Sdk() {
  try {
    return require("@aws-sdk/client-s3");
  } catch (_error) {
    throw new Error("Не найден пакет @aws-sdk/client-s3");
  }
}

let yosClient = null;

function getYosClient() {
  if (yosClient) return yosClient;

  const env = ensureAnalyticsStorageEnv();
  const { S3Client } = requireS3Sdk();
  yosClient = new S3Client({
    region: env.region,
    endpoint: YOS_API_URL,
    credentials: {
      accessKeyId: env.accessKey,
      secretAccessKey: env.secretKey,
    },
  });
  return yosClient;
}

async function streamToString(body) {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return Buffer.from(body).toString("utf-8");
  if (typeof body.transformToString === "function") {
    return await body.transformToString();
  }
  if (typeof body.getReader === "function") {
    const reader = body.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString("utf-8");
  }

  const chunks = [];
  for await (const chunk of body) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function toUtcYmd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function parseRequiredYmd(value, fieldName) {
  const normalized = asString(value).trim();
  if (!parseYmd(normalized)) {
    throw new Error(`${fieldName} должен быть в формате YYYY-MM-DD`);
  }
  return normalized;
}

async function getObjectText(key) {
  const env = ensureAnalyticsStorageEnv();
  const { GetObjectCommand } = requireS3Sdk();

  try {
    const resp = await getYosClient().send(
      new GetObjectCommand({
        Bucket: env.bucket,
        Key: key,
      }),
    );
    return await streamToString(resp.Body);
  } catch (error) {
    const status = Number(error?.$metadata?.httpStatusCode || 0);
    if (status === 404 || error?.name === "NoSuchKey" || error?.Code === "NoSuchKey") {
      return null;
    }
    throw new Error(`Object Storage GET ${key} failed: ${error?.message || "unknown error"}`);
  }
}

async function putObjectText(key, text) {
  const env = ensureAnalyticsStorageEnv();
  const { PutObjectCommand } = requireS3Sdk();

  try {
    await getYosClient().send(
      new PutObjectCommand({
        Bucket: env.bucket,
        Key: key,
        Body: asString(text),
        ContentType: "application/x-ndjson; charset=utf-8",
      }),
    );
  } catch (error) {
    throw new Error(`Object Storage PUT ${key} failed: ${error?.message || "unknown error"}`);
  }
}

async function listObjectKeys(prefix) {
  const env = ensureAnalyticsStorageEnv();
  const { ListObjectsV2Command } = requireS3Sdk();
  const keys = [];
  let token = "";

  while (true) {
    let resp;
    try {
      resp = await getYosClient().send(
        new ListObjectsV2Command({
          Bucket: env.bucket,
          Prefix: asString(prefix).trim(),
          ContinuationToken: token || undefined,
        }),
      );
    } catch (error) {
      throw new Error(`Object Storage LIST failed: ${error?.message || "unknown error"}`);
    }

    for (const item of resp?.Contents || []) {
      const key = asString(item?.Key).trim();
      if (key) keys.push(key);
    }

    if (!resp?.IsTruncated || !resp?.NextContinuationToken) break;
    token = asString(resp.NextContinuationToken).trim();
  }

  return keys;
}

async function readAnalyticsEventsForKeys(keys) {
  const events = [];
  for (const key of keys) {
    const text = await getObjectText(key);
    if (!text) continue;
    for (const line of text.split(/\n+/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object") events.push(parsed);
      } catch {
        // skip broken rows
      }
    }
  }
  return events;
}

function getAnalyticsPeriod(periodRaw) {
  const period = asString(periodRaw).trim().toLowerCase() || "today";
  if (!["today", "yesterday", "week", "month", "all"].includes(period)) {
    throw new Error("period должен быть today | yesterday | week | month | all");
  }
  return period;
}

async function loadAnalyticsEvents(periodRaw) {
  const period = getAnalyticsPeriod(periodRaw);
  ensureAnalyticsStorageEnv();

  if (period === "all") {
    const keys = (await listObjectKeys("events/"))
      .filter((key) => /^events\/\d{4}-\d{2}-\d{2}\.jsonl$/.test(key))
      .sort();
    const events = await readAnalyticsEventsForKeys(keys);
    if (!keys.length) {
      const today = toMoscowDate(new Date());
      return { period, events, dateRange: `${today} - ${today}`, endDate: today };
    }
    const startDate = keys[0].slice("events/".length, "events/".length + 10);
    const endDate = keys[keys.length - 1].slice("events/".length, "events/".length + 10);
    return { period, events, dateRange: `${startDate} - ${endDate}`, endDate };
  }

  const today = toMoscowDate(new Date());
  let startDate = today;
  let endDate = today;

  if (period === "yesterday") {
    startDate = shiftYmd(today, -1);
    endDate = startDate;
  } else if (period === "week") {
    startDate = shiftYmd(today, -6);
  } else if (period === "month") {
    startDate = shiftYmd(today, -29);
  }

  const keys = enumerateYmdRange(startDate, endDate).map((day) => `events/${day}.jsonl`);
  const events = await readAnalyticsEventsForKeys(keys);
  return {
    period,
    events,
    dateRange: `${startDate} - ${endDate}`,
    endDate,
  };
}

function aggregateAnalyticsEvents({ period, events, dateRange, endDate }) {
  const users = new Set();
  const newUsers = new Set();
  const sessionUsers = new Set();
  const durations = [];
  const sources = new Map();
  const pageCounts = new Map();
  const hourCounts = new Array(24).fill(0);
  const instruments = createInstrumentCounters();
  const sharesByInstrument = createShareCounters();
  const currentDayUsers = new Set();
  const previousDayUsers = new Set();
  const currentRetentionDate = endDate || toMoscowDate(new Date());
  const previousRetentionDate = shiftYmd(currentRetentionDate, -1);

  let totalSessions = 0;
  let paymentInits = 0;
  let freeTotal = 0;
  let paidTotal = 0;
  let totalShares = 0;
  let isMaxSessions = 0;

  for (const rawEvent of Array.isArray(events) ? events : []) {
    const event = normalizeAnalyticsEvent(rawEvent);
    if (!event) continue;

    if (event.user_id) users.add(event.user_id);

    const eventDateObj = parseDateSafe(event.timestamp);
    if (eventDateObj) {
      const hour = Number(getMoscowDateParts(eventDateObj).hour);
      if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
        hourCounts[hour] += 1;
      }
    }

    const eventDate = eventDateObj ? toMoscowDate(eventDateObj) : "";

    if (event.event_type === "session_start") {
      totalSessions += 1;
      sessionUsers.add(event.user_id);
      if (event.is_new_user) {
        newUsers.add(event.user_id);
      }
      if (event.is_max) isMaxSessions += 1;
      const source = sanitizeSource(event.source || "direct");
      sources.set(source, (sources.get(source) || 0) + 1);
      if (eventDate === currentRetentionDate) currentDayUsers.add(event.user_id);
      if (eventDate === previousRetentionDate) previousDayUsers.add(event.user_id);
    }

    if (event.event_type === "page_view" && event.page) {
      pageCounts.set(event.page, (pageCounts.get(event.page) || 0) + 1);
    }

    if (event.event_type === "reading_complete" && event.instrument && event.tier) {
      instruments[event.instrument][event.tier] += 1;
      if (event.tier === "free") freeTotal += 1;
      if (event.tier === "paid") paidTotal += 1;
    }

    if (event.event_type === "payment_init") {
      paymentInits += 1;
    }

    if (event.event_type === "share" && event.instrument) {
      totalShares += 1;
      sharesByInstrument[event.instrument] += 1;
    }

    if (event.event_type === "session_end") {
      const duration = Number(event.duration_seconds);
      if (Number.isFinite(duration) && duration >= 0) durations.push(duration);
    }
  }

  const retainedUsers = Array.from(currentDayUsers).filter((userId) => previousDayUsers.has(userId));
  const uniqueSessionUsers = sessionUsers.size > 0 ? sessionUsers : users;
  const returningSessionUsers = Array.from(uniqueSessionUsers).filter(
    (userId) => !newUsers.has(userId),
  );
  const avgDuration =
    durations.length > 0
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : 0;
  const topPages = Array.from(pageCounts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return ANALYTICS_INSTRUMENTS.indexOf(a[0]) - ANALYTICS_INSTRUMENTS.indexOf(b[0]);
    })
    .map(([page]) => page);

  let peakHour = 0;
  let peakCount = -1;
  for (let i = 0; i < hourCounts.length; i += 1) {
    if (hourCounts[i] > peakCount) {
      peakCount = hourCounts[i];
      peakHour = i;
    }
  }

  return {
    period,
    date_range: dateRange,
    users: {
      total_sessions: totalSessions,
      unique_users: uniqueSessionUsers.size,
      new_users: newUsers.size,
      returning_users: returningSessionUsers.length,
      avg_session_duration_sec: avgDuration,
    },
    sources: Object.fromEntries(
      Array.from(sources.entries()).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0], "ru");
      }),
    ),
    instruments,
    conversion: {
      free_total: freeTotal,
      paid_total: paidTotal,
      rate_percent: freeTotal > 0 ? roundTo((paidTotal / freeTotal) * 100, 2) : 0,
      payment_inits: paymentInits,
      payment_to_paid_rate: paymentInits > 0 ? roundTo((paidTotal / paymentInits) * 100, 2) : 0,
    },
    shares: {
      total: totalShares,
      by_instrument: sharesByInstrument,
    },
    retention: {
      users_today_who_were_yesterday: retainedUsers.length,
      d1_rate_percent:
        previousDayUsers.size > 0
          ? roundTo((retainedUsers.length / previousDayUsers.size) * 100, 2)
          : 0,
    },
    top_pages: topPages,
    is_max_percent: totalSessions > 0 ? roundTo((isMaxSessions / totalSessions) * 100, 2) : 0,
    peak_hour: peakHour,
  };
}

async function getAnalyticsSummary(periodRaw) {
  const data = await loadAnalyticsEvents(periodRaw);
  return aggregateAnalyticsEvents(data);
}

function createBasicToolCounters() {
  return {
    compatibility: 0,
    tarot: 0,
    numerology: 0,
    dreambook: 0,
  };
}

async function loadAnalyticsEventsByRange(from, to) {
  ensureAnalyticsStorageEnv();
  const keys = enumerateYmdRange(from, to).map((day) => `events/${day}.jsonl`);
  const events = await readAnalyticsEventsForKeys(keys);
  return { from, to, events };
}

function aggregateBasicAnalytics({ from, to, events }) {
  const dauSets = new Map();
  const periodUsers = new Set();
  const readingComplete = createBasicToolCounters();
  let totalSessions = 0;
  let paymentInit = 0;
  let shareCount = 0;

  for (const rawEvent of Array.isArray(events) ? events : []) {
    if (!rawEvent || typeof rawEvent !== "object") continue;

    const eventType = asString(rawEvent?.event_type || rawEvent?.type).trim();
    const userId = asString(rawEvent?.user_id || rawEvent?.userId).trim() || "anonymous";
    const instrument = asString(rawEvent?.instrument || rawEvent?.tool).trim();
    const ts =
      parseDateSafe(rawEvent?.timestamp) ||
      parseDateSafe(rawEvent?.received_at) ||
      parseDateSafe(rawEvent?.created_at);
    const day = toUtcYmd(ts);

    if (!day || day < from || day > to) continue;

    if (!dauSets.has(day)) dauSets.set(day, new Set());
    dauSets.get(day).add(userId);
    periodUsers.add(userId);

    if (eventType === "session_start") totalSessions += 1;
    if (eventType === "payment_init") paymentInit += 1;
    if (eventType === "share") shareCount += 1;
    if (eventType === "reading_complete" && Object.prototype.hasOwnProperty.call(readingComplete, instrument)) {
      readingComplete[instrument] += 1;
    }
  }

  const dauByDay = {};
  for (const day of enumerateYmdRange(from, to)) {
    dauByDay[day] = dauSets.get(day)?.size || 0;
  }

  return {
    from,
    to,
    dau: dauByDay,
    dau_total_unique: periodUsers.size,
    total_sessions: totalSessions,
    reading_complete: readingComplete,
    payment_init: paymentInit,
    share_count: shareCount,
  };
}

async function getBasicAnalyticsSummary(rangeInput) {
  const from = parseRequiredYmd(rangeInput?.from, "from");
  const to = parseRequiredYmd(rangeInput?.to, "to");
  if (from > to) {
    throw new Error("from не может быть больше to");
  }
  const data = await loadAnalyticsEventsByRange(from, to);
  return aggregateBasicAnalytics(data);
}

async function handleTrack(body) {
  const rawEvents = Array.isArray(body?.events) ? body.events : [];
  if (rawEvents.length === 0) {
    return jsonResponse(200, { success: true, received: 0, stored: 0 });
  }

  ensureAnalyticsStorageEnv();

  const receivedAt = new Date().toISOString();
  const grouped = new Map();
  for (const rawEvent of rawEvents) {
    const event = normalizeAnalyticsEvent(rawEvent);
    if (!event) continue;
    const day = toUtcYmd(parseDateSafe(event.timestamp) || new Date());
    const enriched = { ...event, received_at: receivedAt };
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day).push(enriched);
  }

  let stored = 0;
  for (const [day, events] of grouped.entries()) {
    const key = `events/${day}.jsonl`;
    const existingText = (await getObjectText(key)) || "";
    const rows = events.map((event) => JSON.stringify(event));

    if (rows.length > 0) {
      const prefix =
        existingText && !existingText.endsWith("\n") ? `${existingText}\n` : existingText;
      await putObjectText(key, `${prefix}${rows.join("\n")}\n`);
      stored += rows.length;
    }
  }

  return jsonResponse(200, {
    success: true,
    received: rawEvents.length,
    stored,
  });
}

async function handleAnalytics(body) {
  const expectedSecret = asString(process.env.ANALYTICS_SECRET).trim();
  if (!expectedSecret) {
    return jsonResponse(500, {
      success: false,
      error: "Не задан ANALYTICS_SECRET в env",
    });
  }

  const providedSecret = asString(body?.secret).trim();
  if (!providedSecret || providedSecret !== expectedSecret) {
    return jsonResponse(403, {
      success: false,
      error: "Доступ запрещен",
    });
  }

  try {
    const summary = await getBasicAnalyticsSummary({
      from: body?.from,
      to: body?.to,
    });
    return jsonResponse(200, { success: true, ...summary });
  } catch (error) {
    const message = asString(error?.message).trim();
    if (
      message.includes("должен быть в формате YYYY-MM-DD") ||
      message.includes("from не может быть больше to")
    ) {
      return jsonResponse(400, { success: false, error: message });
    }
    throw error;
  }
}

function extractBotWebhookUpdates(body) {
  const candidates = [body?.update, body?.payload, body?.webhook, body?.updates];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.every((item) => isMaxUpdateBody(item))) {
      return candidate;
    }
    if (isMaxUpdateBody(candidate)) {
      return candidate;
    }
  }

  const topLevel = { ...(body || {}) };
  delete topLevel.action;
  if (isMaxUpdateBody(topLevel)) {
    return topLevel;
  }

  return null;
}

function isTodayStatsCommand(text) {
  return /^\/stats(?:@\S+)?\s+today\s*$/i.test(asString(text).trim());
}

function buildTodayStatsMessage(summary) {
  const day = asString(summary?.from).trim();
  const dau = Number(summary?.dau?.[day] || 0);
  return [
    `Статистика за ${day} UTC:`,
    `DAU: ${dau}`,
    `Сессии: ${summary?.total_sessions || 0}`,
    `reading_complete: совместимость ${summary?.reading_complete?.compatibility || 0}, карта дня ${summary?.reading_complete?.tarot || 0}, имя ${summary?.reading_complete?.numerology || 0}, сонник ${summary?.reading_complete?.dreambook || 0}`,
    `payment_init: ${summary?.payment_init || 0}`,
    `share: ${summary?.share_count || 0}`,
  ].join("\n");
}

async function handleBotWebhook(event, body) {
  const expectedSecret = asString(process.env.MAX_WEBHOOK_SECRET).trim();
  if (expectedSecret) {
    const actualSecret =
      getHeader(event?.headers, "x-max-bot-api-secret") ||
      getHeader(event?.headers, "X-Max-Bot-Api-Secret");
    if (!actualSecret || actualSecret !== expectedSecret) {
      return jsonResponse(401, { success: false, error: "Unauthorized" });
    }
  }

  const token = asString(process.env.MAX_BOT_TOKEN).trim();
  if (!token) {
    return jsonResponse(500, { success: false, error: "Не задан MAX_BOT_TOKEN в env" });
  }

  const adminUserId = asString(process.env.ADMIN_USER_ID).trim();
  const updates = extractBotWebhookUpdates(body);
  if (!updates) {
    return jsonResponse(400, { success: false, error: "Некорректный webhook Max" });
  }

  const items = Array.isArray(updates) ? updates : [updates];
  for (const updateBody of items) {
    if (asString(updateBody?.update_type).trim() !== "message_created") continue;

    const senderUserId = asString(updateBody?.message?.sender?.user_id).trim();
    const text = asString(updateBody?.message?.body?.text).trim();
    if (!adminUserId || senderUserId !== adminUserId || !isTodayStatsCommand(text)) continue;

    const todayUtc = toUtcYmd(new Date());
    try {
      const summary = await getBasicAnalyticsSummary({ from: todayUtc, to: todayUtc });
      const recipient = updateBody?.message?.recipient;
      const chatId =
        asString(recipient?.type).trim().toLowerCase() === "chat"
          ? asString(recipient?.chat_id).trim()
          : "";

      await sendBotMessage({
        token,
        userId: senderUserId,
        chatId,
        text: buildTodayStatsMessage(summary),
      });
    } catch (error) {
      const recipient = updateBody?.message?.recipient;
      const chatId =
        asString(recipient?.type).trim().toLowerCase() === "chat"
          ? asString(recipient?.chat_id).trim()
          : "";

      await sendBotMessage({
        token,
        userId: senderUserId,
        chatId,
        text: `Не удалось получить аналитику: ${error?.message || "ошибка"}`,
      });
    }
  }

  return jsonResponse(200, { success: true });
}

function parseStatsCommand(text) {
  const trimmed = asString(text).trim();
  const match = /^\/stats(?:@\S+)?(?:\s+([a-z]+))?\s*$/i.exec(trimmed);
  if (!match) return null;
  return {
    period: getAnalyticsPeriod(match[1] || "today"),
  };
}

function formatSourcesForMessage(sources) {
  const labels = {
    vk_clip: "VK Клипы",
    ok: "ОК",
    direct: "Прямой",
    max_catalog: "Каталог Max",
    unknown: "Неизвестно",
    avito: "Авито",
  };

  return Object.entries(sources || {})
    .filter(([, count]) => Number(count) > 0)
    .slice(0, 6)
    .map(([source, count]) => `  ${labels[source] || source}: ${count}`)
    .join("\n");
}

function instrumentLabelForMessage(instrument) {
  const labels = {
    compatibility: "совместимость",
    tarot: "карта дня",
    numerology: "имя",
    dreambook: "сонник",
  };
  return labels[instrument] || instrument;
}

function buildStatsMessage(summary) {
  const range = asString(summary?.date_range).split(" - ");
  const start = range[0] || "";
  const end = range[1] || start;
  const isSingleDay = start && start === end;

  const periodTitle = {
    today: "сегодня",
    yesterday: "вчера",
    week: "неделю",
    month: "месяц",
    all: "все время",
  }[summary?.period] || "период";

  const shares = summary?.shares?.by_instrument || {};
  const shareTop = Object.entries(shares)
    .sort((a, b) => b[1] - a[1])
    .find(([, count]) => Number(count) > 0);
  const shareSuffix = shareTop
    ? ` (${instrumentLabelForMessage(shareTop[0])}: ${shareTop[1]})`
    : "";
  const sourceLines = formatSourcesForMessage(summary?.sources);

  return [
    isSingleDay
      ? `Аналитика за ${periodTitle} (${formatRuDate(start)}):`
      : `Аналитика за ${periodTitle} (${formatRuDate(start)} - ${formatRuDate(end)}):`,
    "",
    `Пользователи: ${summary?.users?.unique_users || 0} уникальных (${summary?.users?.new_users || 0} новых)`,
    `Сессий: ${summary?.users?.total_sessions || 0}, среднее время: ${formatDuration(summary?.users?.avg_session_duration_sec || 0)}`,
    `Из Max: ${roundTo(summary?.is_max_percent || 0, 0)}%`,
    "",
    "Расклады:",
    `  Совместимость: ${summary?.instruments?.compatibility?.free || 0} бесплатных, ${summary?.instruments?.compatibility?.paid || 0} платных`,
    `  Карта дня: ${summary?.instruments?.tarot?.free || 0} бесплатных, ${summary?.instruments?.tarot?.paid || 0} платных`,
    `  Имя: ${summary?.instruments?.numerology?.free || 0} бесплатных, ${summary?.instruments?.numerology?.paid || 0} платных`,
    `  Сонник: ${summary?.instruments?.dreambook?.free || 0} бесплатных, ${summary?.instruments?.dreambook?.paid || 0} платных`,
    "",
    `Конверсия: ${roundTo(summary?.conversion?.rate_percent || 0, 2)}% (${summary?.conversion?.paid_total || 0} из ${summary?.conversion?.free_total || 0})`,
    `Шеры: ${summary?.shares?.total || 0}${shareSuffix}`,
    "",
    "Источники:",
    sourceLines || "  Нет данных",
    "",
    `Пик активности: ${String(summary?.peak_hour || 0).padStart(2, "0")}:00`,
  ].join("\n");
}

async function maybeHandleStatsMessage(updateBody, token) {
  const senderUserId = asString(updateBody?.message?.sender?.user_id).trim();
  const adminUserId = asString(process.env.ADMIN_USER_ID).trim();
  if (!senderUserId || !adminUserId || senderUserId !== adminUserId) return false;

  const text = asString(updateBody?.message?.body?.text).trim();
  let parsed;
  try {
    parsed = parseStatsCommand(text);
  } catch (error) {
    const recipient = updateBody?.message?.recipient;
    await sendBotMessage({
      token,
      userId: senderUserId,
      chatId: asString(recipient?.type).trim().toLowerCase() === "chat"
        ? asString(recipient?.chat_id).trim()
        : "",
      text: error?.message || "Некорректная команда",
    });
    return true;
  }
  if (!parsed) return false;

  const recipient = updateBody?.message?.recipient;
  const chatId =
    asString(recipient?.type).trim().toLowerCase() === "chat"
      ? asString(recipient?.chat_id).trim()
      : "";

  try {
    const summary = await getAnalyticsSummary(parsed.period);
    await sendBotMessage({
      token,
      userId: senderUserId,
      chatId,
      text: buildStatsMessage(summary),
    });
  } catch (error) {
    await sendBotMessage({
      token,
      userId: senderUserId,
      chatId,
      text: `Не удалось получить аналитику: ${error?.message || "ошибка"}`,
    });
  }

  return true;
}

async function handleMaxUpdate(event, updateBody) {
  const token = process.env.MAX_BOT_TOKEN || "";
  if (!token) throw new Error("Не задан MAX_BOT_TOKEN в env");

  const expectedSecret = process.env.MAX_WEBHOOK_SECRET || "";
  if (expectedSecret) {
    const actualSecret =
      getHeader(event?.headers, "x-max-bot-api-secret") ||
      getHeader(event?.headers, "X-Max-Bot-Api-Secret");
    if (!actualSecret || actualSecret !== expectedSecret) {
      return jsonResponse(401, { success: false, error: "Unauthorized" });
    }
  }

  const updateType = asString(updateBody?.update_type).trim();
  if (updateType === "bot_started") {
    const chatId = asString(updateBody?.chat_id).trim();
    const userId = asString(updateBody?.user?.user_id).trim();
    try {
      await sendWelcome({
        token,
        chatId,
        userId,
        user: updateBody?.user,
      });
    } catch (_e) {
      // do not fail webhook delivery
    }
  }

  if (updateType === "message_created") {
    const text = asString(updateBody?.message?.body?.text).trim();
    const handledStats = await maybeHandleStatsMessage(updateBody, token);
    if (handledStats) {
      return jsonResponse(200, { success: true });
    }
    const isStart = text === "/start" || text.toLowerCase() === "start";
    if (isStart) {
      const sender = updateBody?.message?.sender;
      const userId = asString(sender?.user_id).trim();
      const recipient = updateBody?.message?.recipient;
      const recipientType = asString(recipient?.type).trim().toLowerCase();
      const chatId =
        recipientType === "chat" ? asString(recipient?.chat_id).trim() : "";

      try {
        await sendWelcome({
          token,
          userId,
          chatId,
          user: sender,
        });
      } catch (_e) {
        // ignore
      }
    }
  }

  return jsonResponse(200, { success: true });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(payload),
  };
}

function asString(v) {
  if (v === undefined || v === null) return "";
  return String(v);
}

function normalizeGender(raw) {
  const s = asString(raw).trim().toLowerCase();
  if (!s) return "";

  // common values
  if (
    s === "m" ||
    s === "male" ||
    s === "man" ||
    s === "masculine" ||
    s === "1" ||
    s === "м" ||
    s.startsWith("муж")
  ) {
    return "male";
  }
  if (
    s === "f" ||
    s === "female" ||
    s === "woman" ||
    s === "feminine" ||
    s === "2" ||
    s === "ж" ||
    s.startsWith("жен")
  ) {
    return "female";
  }
  if (
    s === "neutral" ||
    s === "none" ||
    s === "unknown" ||
    s === "n" ||
    s === "0" ||
    s.startsWith("не")
  ) {
    return "neutral";
  }

  return "";
}

function inferGenderFromName(name) {
  const raw = asString(name).trim();
  if (!raw) return "";

  const firstToken = raw.split(/[\s-]+/).filter(Boolean)[0] || "";
  const n = firstToken.toLowerCase().replace(/[\u0451]/g, "е").replace(/[^a-zа-я]/gi, "");
  if (!n) return "";

  const ambiguous = new Set(["саша", "женя", "валя", "шура", "слава"]);
  if (ambiguous.has(n)) return "";

  const maleOverrides = new Set([
    "никита",
    "илья",
    "фома",
    "кузьма",
    "лука",
    "савва",
    "ваня",
    "петя",
    "коля",
    "витя",
    "миша",
    "гриша",
    "леша",
    "сережа",
    "дима",
    "юра",
    "паша",
    "толя",
    "боря",
    "вася",
  ]);
  if (maleOverrides.has(n)) return "male";

  const femaleOverrides = new Set(["любовь"]);
  if (femaleOverrides.has(n)) return "female";

  if (/[ая]$/.test(n)) return "female";

  // Infer male when strong signal (most Russian male names).
  if (/[йбвгджзклмнпрстфхцчшщ]$/.test(n)) return "male";

  return "";
}

function resolveUserGender({ body, data }) {
  const explicit = normalizeGender(body?.userGender || body?.gender || data?.userGender || data?.gender);
  if (explicit) return explicit;

  const fromUser = normalizeGender(body?.user?.gender || body?.user?.sex);
  if (fromUser) return fromUser;

  const inferred = inferGenderFromName(body?.user?.first_name || body?.user?.name || data?.name);
  return inferred;
}

function buildGenderSystemPrompt(gender) {
  if (gender === "male") {
    return (
      "Пользователь мужчина. При обращении к пользователю используй мужской род. " +
      "Не используй женский род по отношению к пользователю."
    );
  }
  if (gender === "female") {
    return (
      "Пользователь женщина. При обращении к пользователю используй женский род. " +
      "Не используй мужской род по отношению к пользователю."
    );
  }
  if (gender === "neutral") {
    return (
      "Пол пользователя не определен. Пиши по отношению к пользователю без указания рода: " +
      "избегай прошедшего времени и кратких прилагательных, которые меняются по роду."
    );
  }
  return "";
}

function decodeBody(event) {
  if (!event || event.body === undefined || event.body === null) return "";
  if (typeof event.body === "string") {
    if (event.isBase64Encoded) {
      return Buffer.from(event.body, "base64").toString("utf8");
    }
    return event.body;
  }
  if (typeof event.body === "object") return JSON.stringify(event.body);
  return asString(event.body);
}

function buildUserMessage(instrument, tier, data) {
  const isFree = tier === "free";
  const limit = isFree ? "\nДлина ответа: не более 150 слов" : "";

  switch (instrument) {
    case "compatibility": {
      const name1 = asString(data?.name1).trim();
      const date1 = asString(data?.date1).trim();
      const name2 = asString(data?.name2).trim();
      const date2 = asString(data?.date2).trim();
      if (!name1 || !date1 || !name2 || !date2) {
        throw new Error(
          "compatibility требует data.name1, data.date1, data.name2, data.date2",
        );
      }
      return `Имя 1: ${name1}\nДата рождения 1: ${date1}\nИмя 2: ${name2}\nДата рождения 2: ${date2}${limit}`;
    }
    case "tarot": {
      const card = asString(data?.card).trim();
      const questionRaw = asString(data?.question).trim();
      const question = questionRaw ? questionRaw : "не задан";
      if (!card) throw new Error("tarot требует data.card");
      return `Карта: ${card}\nВопрос дня: ${question}${limit}`;
    }
    case "numerology": {
      const name = asString(data?.name).trim();
      const dateRaw = asString(data?.date).trim();
      const date = dateRaw ? dateRaw : "не указана";
      if (!name) throw new Error("numerology требует data.name");
      return `Имя: ${name}\nДата рождения: ${date}${limit}`;
    }
    case "dreambook": {
      const dream = asString(data?.dream).trim();
      if (!dream) throw new Error("dreambook требует data.dream");
      return `Сон: ${dream}${limit}`;
    }
    default:
      throw new Error("Неизвестный instrument");
  }
}

function pickModelUri() {
  return (
    process.env.DEEPSEEK_MODEL_URI ||
    process.env.MODEL_URI ||
    process.env.YC_MODEL_URI ||
    ""
  );
}

function getCompletionOptions(tier) {
  const defaultTemp = 0.7;
  const temperature =
    process.env.DEEPSEEK_TEMPERATURE !== undefined
      ? Number(process.env.DEEPSEEK_TEMPERATURE)
      : defaultTemp;

  const freeMax =
    process.env.DEEPSEEK_MAX_TOKENS_FREE !== undefined
      ? Number(process.env.DEEPSEEK_MAX_TOKENS_FREE)
      : 450;
  const paidMax =
    process.env.DEEPSEEK_MAX_TOKENS_PAID !== undefined
      ? Number(process.env.DEEPSEEK_MAX_TOKENS_PAID)
      : 1200;

  const maxTokens = tier === "paid" ? paidMax : freeMax;

  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new Error("Некорректная DEEPSEEK_TEMPERATURE (ожидается 0..2)");
  }
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
    throw new Error("Некорректный maxTokens");
  }

  return { maxTokens: Math.trunc(maxTokens), temperature };
}

function extractText(apiJson) {
  const content = apiJson?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  return "";
}

async function callDeepSeekViaYandexAIStudio({ apiKey, modelUri, messages, tier }) {
  const completionOptions = getCompletionOptions(tier);

  const controller = new AbortController();
  const timeoutMs =
    process.env.DEEPSEEK_TIMEOUT_MS !== undefined
      ? Number(process.env.DEEPSEEK_TIMEOUT_MS)
      : 30000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(YC_COMPLETION_URL, {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelUri,
        reasoning_effort: "none",
        messages: Array.isArray(messages)
          ? messages.map((m) => ({ role: m?.role, content: m?.text }))
          : [],
        max_tokens: completionOptions.maxTokens,
        temperature: completionOptions.temperature,
      }),
      signal: controller.signal,
    });

    const text = await resp.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!resp.ok) {
      const errMsg =
        json?.error?.message ||
        json?.message ||
        (text && text.length < 2000 ? text : "") ||
        `Yandex AI Studio HTTP ${resp.status}`;
      throw new Error(errMsg);
    }

    const answer = extractText(json);
    if (!answer) {
      throw new Error("Пустой ответ от модели");
    }
    return answer;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePaymentStatus(yookassaStatus) {
  const s = asString(yookassaStatus).trim().toLowerCase();
  if (s === "succeeded") return "succeeded";
  if (s === "canceled") return "canceled";
  return "pending";
}

async function handleCreatePayment(body) {
  const instrument = asString(body?.instrument).trim();
  const userId = asString(body?.userId).trim();

  if (!instrument || !Object.prototype.hasOwnProperty.call(INSTRUMENT_PRICES, instrument)) {
    return jsonResponse(400, {
      success: false,
      error: "Некорректный instrument",
    });
  }
  if (!userId) {
    return jsonResponse(400, { success: false, error: "Не задан userId" });
  }

  const shopId = process.env.YUKASSA_SHOP_ID;
  const secretKey = process.env.YUKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    return jsonResponse(500, {
      success: false,
      error: "Не заданы YUKASSA_SHOP_ID / YUKASSA_SECRET_KEY в env",
    });
  }

  const idempotenceKey = crypto.randomUUID();
  const price = INSTRUMENT_PRICES[instrument];
  const amountValue = (Number(price) / 100).toFixed(2);

  const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  const resp = await fetch(YUKASSA_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotenceKey,
    },
    body: JSON.stringify({
      amount: { value: amountValue, currency: "RUB" },
      payment_method_data: { type: "sbp" },
      confirmation: {
        type: "redirect",
        return_url: "https://gerogiresasha.github.io/max-esoteric/",
      },
      capture: true,
      description: `Расклад: ${instrument}`,
      idempotence_key: idempotenceKey,
    }),
  });

  const text = await resp.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!resp.ok) {
    const errMsg =
      json?.description ||
      json?.message ||
      (text && text.length < 2000 ? text : "") ||
      `YooKassa HTTP ${resp.status}`;
    return jsonResponse(502, { success: false, error: errMsg });
  }

  const paymentId = asString(json?.id).trim();
  const confirmationUrl = asString(json?.confirmation?.confirmation_url).trim();
  if (!paymentId || !confirmationUrl) {
    return jsonResponse(502, {
      success: false,
      error: "Некорректный ответ от ЮKassa (нет id/confirmation_url)",
    });
  }

  payments.set(paymentId, { status: "pending", instrument, userId });
  return jsonResponse(200, { success: true, paymentId, confirmationUrl });
}

async function handlePaymentStatus(body) {
  const paymentId = asString(body?.paymentId).trim();
  if (!paymentId) {
    return jsonResponse(400, { success: false, error: "Не задан paymentId" });
  }

  const cached = payments.get(paymentId);
  if (cached?.status && cached.status !== "pending") {
    return jsonResponse(200, {
      success: true,
      status: normalizePaymentStatus(cached.status),
    });
  }

  const shopId = process.env.YUKASSA_SHOP_ID;
  const secretKey = process.env.YUKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    return jsonResponse(500, {
      success: false,
      error: "Не заданы YUKASSA_SHOP_ID / YUKASSA_SECRET_KEY в env",
    });
  }

  const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  const resp = await fetch(`${YUKASSA_API_URL}/${encodeURIComponent(paymentId)}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  });

  const text = await resp.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!resp.ok) {
    const errMsg =
      json?.description ||
      json?.message ||
      (text && text.length < 2000 ? text : "") ||
      `YooKassa HTTP ${resp.status}`;
    return jsonResponse(502, { success: false, error: errMsg });
  }

  const status = normalizePaymentStatus(json?.status);
  payments.set(paymentId, {
    ...(cached && typeof cached === "object" ? cached : {}),
    status,
  });
  return jsonResponse(200, { success: true, status });
}

async function handleWebhook(body) {
  const paymentId = asString(body?.object?.id).trim();
  const status = normalizePaymentStatus(body?.object?.status);
  if (!paymentId) {
    return jsonResponse(400, { success: false, error: "Некорректный webhook" });
  }

  payments.set(paymentId, {
    ...(payments.get(paymentId) || {}),
    status,
  });
  return jsonResponse(200, { success: true });
}

exports.handler = async function handler(event) {
  try {
    const method = (event?.httpMethod || event?.requestContext?.http?.method || "")
      .toUpperCase()
      .trim();

    if (method === "OPTIONS") {
      return {
        statusCode: 204,
        headers: corsHeaders(),
        body: "",
      };
    }

    if (method && method !== "POST") {
      return jsonResponse(405, { success: false, error: "Method Not Allowed" });
    }

    const raw = decodeBody(event);
    let body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return jsonResponse(400, { success: false, error: "Некорректный JSON" });
    }

    const action = asString(body?.action).trim();
    if (action === "bot-webhook") {
      return await handleBotWebhook(event, body);
    }

    // MAX webhook updates (welcome message, etc.)
    if (Array.isArray(body) && body.every((u) => isMaxUpdateBody(u))) {
      for (const u of body) {
        await handleMaxUpdate(event, u);
      }
      return jsonResponse(200, { success: true });
    }
    if (isMaxUpdateBody(body)) {
      return await handleMaxUpdate(event, body);
    }
    if (action === "track") {
      return await handleTrack(body);
    }
    if (action === "analytics") {
      return await handleAnalytics(body);
    }
    if (action === "create-payment") {
      return await handleCreatePayment(body);
    }
    if (action === "payment-status") {
      return await handlePaymentStatus(body);
    }
    if (action === "webhook") {
      return await handleWebhook(body);
    }

    const instrument = asString(body?.instrument).trim();
    const tier = asString(body?.tier).trim();
    const data = body?.data;

    if (
      !["compatibility", "tarot", "numerology", "dreambook"].includes(instrument)
    ) {
      return jsonResponse(400, {
        success: false,
        error:
          "instrument должен быть compatibility | tarot | numerology | dreambook",
      });
    }
    if (!["free", "paid"].includes(tier)) {
      return jsonResponse(400, {
        success: false,
        error: "tier должен быть free | paid",
      });
    }
    if (data === undefined || data === null || typeof data !== "object") {
      return jsonResponse(400, {
        success: false,
        error: "data должен быть объектом",
      });
    }

    const systemPrompt = prompts?.[instrument]?.[tier];
    if (!systemPrompt || typeof systemPrompt !== "string") {
      return jsonResponse(500, {
        success: false,
        error: "Системный промпт не найден (prompts.js)",
      });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return jsonResponse(500, {
        success: false,
        error: "Не задан DEEPSEEK_API_KEY в env",
      });
    }

    const modelUri = pickModelUri();
    if (!modelUri) {
      return jsonResponse(500, {
        success: false,
        error:
          "Не задан modelUri (установи env: DEEPSEEK_MODEL_URI или MODEL_URI)",
      });
    }

    let userText;
    try {
      userText = buildUserMessage(instrument, tier, data);
    } catch (e) {
      return jsonResponse(400, {
        success: false,
        error: e?.message ? String(e.message) : "Некорректные данные",
        });
    }

    const messages = [];
    const gender = resolveUserGender({ body, data }) || "neutral";
    const genderPrompt = buildGenderSystemPrompt(gender);
    if (genderPrompt) {
      messages.push({ role: "system", text: genderPrompt });
    }
    messages.push({ role: "system", text: systemPrompt });
    messages.push({ role: "user", text: userText });

    const answerText = await callDeepSeekViaYandexAIStudio({
      apiKey,
      modelUri,
      messages,
      tier,
    });

    return jsonResponse(200, { success: true, text: answerText });
  } catch (e) {
    // Avoid leaking secrets; only return safe message.
    const msg = e?.name === "AbortError" ? "Таймаут запроса к модели" : asString(e?.message || e);
    return jsonResponse(500, { success: false, error: msg || "Ошибка" });
  }
};
