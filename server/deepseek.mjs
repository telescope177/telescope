import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv();

function modelSettings() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(path.join(root, "data", "model.json"), "utf8"));
  } catch {
    saved = {};
  }
  return {
    key: String(saved.key || process.env.DEEPSEEK_API_KEY || ""),
    model: String(saved.model || process.env.DEEPSEEK_MODEL || "deepseek-chat"),
    base: String(saved.base || process.env.DEEPSEEK_BASE || "https://api.deepseek.com").replace(/\/$/, ""),
  };
}

export async function answerFromSources(query, items) {
  const settings = modelSettings();
  const key = settings.key;
  if (!key || !items.length) return null;
  const model = settings.model;
  const base = settings.base;
  const sources = items.slice(0, 8).map((item, index) => [
    `[${index + 1}] ${item.publishedAt || "日期不详"} ${item.title}`,
    item.context || item.snippet || "",
    item.url || "",
  ].filter(Boolean).join("\n")).join("\n\n");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: "你在回答政务咨询。只根据来源正文回答，名单、数字和成员必须逐字来自来源，来源没有的内容不要补写。名单已经写全时，不要再加“来源未列出”之类的补充。用中文直接回答，不超过 320 字，在相应句子后用［1］［2］标注来源序号。",
        },
        {
          role: "user",
          content: `问题：${query}\n\n来源：\n${sources}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(25000),
  });
  const body = await response.json().catch(() => null);
  const text = body?.choices?.[0]?.message?.content;
  if (!response.ok || typeof text !== "string" || !text.trim()) return null;
  return { text: text.trim(), model };
}
