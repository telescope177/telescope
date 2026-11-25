import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "consults.json");
const kinds = new Set(["国家政策", "会议精神", "政策解读", "通知公告", "咨询答复", "其他"]);

function text(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function readAll() {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(records) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2));
  fs.renameSync(tmp, file);
}

export function listConsults() {
  return readAll();
}

export function saveConsult(report, meta) {
  const refine = report.refine;
  if (!refine || report.classification !== "文档") return null;
  const infoKind = kinds.has(refine.infoKind) ? refine.infoKind : "其他";
  const record = {
    title: text(refine.title || report.title, 80),
    publishedAt: /^\d{4}-\d{2}-\d{2}$/.test(refine.publishedAt) ? refine.publishedAt : "",
    docNo: text(refine.docNo, 40),
    publisher: text(refine.publisher, 40),
    summary: text(refine.summary, 280),
    tags: [...new Set((Array.isArray(refine.tags) ? refine.tags : []).map((tag) => text(tag, 12)).filter(Boolean))].slice(0, 6),
    infoKind,
    finalUrl: text(meta.finalUrl, 500),
    sha256: text(report.sha256, 64),
  };
  if (!record.tags.includes(infoKind)) record.tags.unshift(infoKind);
  if (/^(403|404)\b|Forbidden|要闻最新|时政要闻|Example Domain/.test(record.title)) return null;
  if (/document\.write|403 Forbidden|initial-scale|网站标识码/.test(record.summary)) return null;
  const now = new Date().toISOString();
  const records = readAll();
  const existing = records.find((item) => item.sha256 === record.sha256 || item.finalUrl === record.finalUrl);
  if (existing) {
    Object.assign(existing, record, { updatedAt: now });
    writeAll(records);
    return { ...existing, saved: "updated" };
  }
  const maxId = records.reduce((max, item) => {
    const matched = /^CZ-(\d+)$/.exec(item.id || "");
    return matched ? Math.max(max, Number(matched[1])) : max;
  }, 0);
  const created = {
    id: `CZ-${String(maxId + 1).padStart(3, "0")}`,
    ...record,
    savedAt: now,
    updatedAt: now,
  };
  records.unshift(created);
  writeAll(records.slice(0, 200));
  return { ...created, saved: "created" };
}
