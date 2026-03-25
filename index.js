const prompts = require("./prompts");
const crypto = require("crypto");

const YC_COMPLETION_URL =
  "https://llm.api.cloud.yandex.net/v1/chat/completions";

const YUKASSA_API_URL = "https://api.yookassa.ru/v3/payments";
const MAX_API_URL = "https://platform-api.max.ru";
const INSTRUMENT_PRICES = {
  compatibility: 14900,
  tarot: 9900,
  numerology: 9900,
  dreambook: 9900,
};
const payments = new Map(); // хранилище статусов в памяти

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

  const payload = {
    text,
    attachments: [
      {
        type: "inline_keyboard",
        payload: {
          buttons: [[{ type: "link", text: "Открыть", url: link }]],
        },
      },
    ],
  };

  const query = targetChatId
    ? `chat_id=${encodeURIComponent(targetChatId)}`
    : `user_id=${encodeURIComponent(targetUserId)}`;

  await maxApiRequest(`/messages?${query}`, {
    token,
    method: "POST",
    body: payload,
  });
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

    const action = asString(body?.action).trim();
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

    const messages = [
      { role: "system", text: systemPrompt },
      { role: "user", text: userText },
    ];

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
