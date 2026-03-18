const prompts = require("./prompts");

const YC_COMPLETION_URL =
  "https://llm.api.cloud.yandex.net/v1/chat/completions";

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
