import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");

const GROUPS = [
  ["报送", "上报", "提交", "时限", "什么时候", "每月"],
  ["便民服务", "便民", "街道", "办件"],
  ["数据", "共享", "台账", "口径", "统计"],
  ["会议", "讲话", "会晤", "会见", "峰会", "会议精神"],
  ["政策", "通知", "意见", "办法", "国家政策"],
  ["老龄", "养老"],
  ["互联互通", "亚太", "蓝图"],
  ["腐败", "不正之风", "整治"],
];

function readJson(name) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extraDocs(pages) {
  if (!Array.isArray(pages)) return [];
  return pages.slice(0, 40).map((item) => ({
    id: "",
    title: String(item?.title || "").trim(),
    docNo: "",
    source: String(item?.source || "站内"),
    publishedAt: String(item?.publishedAt || ""),
    kind: "站内",
    status: "",
    url: String(item?.url || ""),
    text: String(item?.title || ""),
  })).filter((item) => item.title.length >= 2 && /^https?:\/\//i.test(item.url));
}

function corpus() {
  const knowledge = readJson("knowledge.json").map((item) => ({
    id: item.id,
    title: String(item.title || ""),
    docNo: String(item.docNo || ""),
    source: String(item.source || ""),
    publishedAt: String(item.publishedAt || ""),
    kind: String(item.category || "政策文件"),
    status: String(item.status || ""),
    url: "",
    text: [item.title, item.docNo, item.summary, ...(item.articles || []).map((article) => article.text)].filter(Boolean).join("\n"),
  }));
  const consults = readJson("consults.json").map((item) => ({
    id: item.id,
    title: String(item.title || ""),
    docNo: String(item.docNo || ""),
    source: String(item.publisher || ""),
    publishedAt: String(item.publishedAt || ""),
    kind: String(item.infoKind || "咨询"),
    status: "已入库",
    url: String(item.finalUrl || ""),
    text: [item.title, item.docNo, item.publisher, item.summary, ...(item.tags || [])].filter(Boolean).join("\n"),
  }));
  return [...knowledge, ...consults];
}

function unique(items) {
  return [...new Set(items.filter((item) => item && item.length >= 2))];
}

function termsOf(query) {
  const primary = [];
  const number = query.match(/[\u4e00-\u9fa5A-Za-z]{1,12}[〔\[]\d{4}[〕\]]\d+号/);
  if (number) primary.push(number[0]);
  const words = GROUPS.flat().sort((a, b) => b.length - a.length);
  let rest = query;
  for (const word of words) {
    if (rest.includes(word)) {
      primary.push(word);
      rest = rest.split(word).join(" ");
    }
  }
  for (const piece of rest.split(/[\s,，。；;、？?！!的了和与在对把]/)) {
    const cleaned = piece.replace(/什么|时候|怎么|如何|一下|给我|相关|资料|文档|文件/g, "").trim();
    if (cleaned.length >= 2 && cleaned.length <= 16) primary.push(cleaned);
  }
  if (query.length >= 2 && query.length <= 24) primary.push(query);
  const base = unique(primary);
  const expanded = [];
  for (const term of base) {
    for (const group of GROUPS) {
      if (group.some((word) => term === word || term.includes(word))) {
        for (const word of group) {
          if (!base.includes(word)) expanded.push(word);
        }
      }
    }
  }
  return { primary: base, expanded: unique(expanded) };
}

function countOf(text, term) {
  if (!term) return 0;
  return text.split(term).length - 1;
}

function snippet(text, terms) {
  const flat = text.replace(/\s+/g, "");
  let at = -1;
  for (const term of terms) {
    const index = flat.indexOf(term);
    if (index >= 0 && (at < 0 || index < at)) at = index;
  }
  if (at < 0) return flat.slice(0, 88);
  const start = Math.max(0, at - 16);
  const slice = flat.slice(start, start + 88);
  return `${start > 0 ? "…" : ""}${slice}${start + 88 < flat.length ? "…" : ""}`;
}

export function searchDocuments(query, pages) {
  const q = String(query || "").replace(/\s+/g, " ").trim();
  if (!q) return { keywords: [], items: [] };
  const { primary, expanded } = termsOf(q);
  const keywords = unique([...primary, ...expanded]).slice(0, 12);
  const library = corpus();
  const knownTitles = new Set(library.map((doc) => doc.title.replace(/\s+/g, "")));
  const seen = new Set();
  const docs = [];
  for (const doc of [...library, ...extraDocs(pages).filter((doc) => !knownTitles.has(doc.title.replace(/\s+/g, " ")))]) {
    const key = doc.url || doc.id || doc.title;
    if (seen.has(key)) continue;
    seen.add(key);
    docs.push(doc);
  }
  const items = docs
    .map((doc) => {
      let score = 0;
      const matched = [];
      if (doc.title.includes(q) || (doc.docNo && doc.docNo.includes(q))) score += 24;
      for (const term of primary) {
        const titleHit = doc.title.includes(term);
        const noHit = doc.docNo.includes(term);
        const bodyHit = countOf(doc.text, term);
        if (!titleHit && !noHit && bodyHit <= 0) continue;
        score += (titleHit ? 8 : 0) + (noHit ? 10 : 0) + Math.min(bodyHit, 4) * 2;
        matched.push(term);
      }
      for (const term of expanded) {
        const titleHit = doc.title.includes(term);
        const bodyHit = countOf(doc.text, term);
        if (!titleHit && bodyHit <= 0) continue;
        score += (titleHit ? 3 : 0) + Math.min(bodyHit, 2);
        matched.push(term);
      }
      return { doc, score, matched: unique(matched).slice(0, 6) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))
    .slice(0, Array.isArray(pages) && pages.length ? 16 : 8)
    .map(({ doc, score, matched }) => ({
      id: doc.id,
      title: doc.title,
      docNo: doc.docNo,
      source: doc.source,
      publishedAt: doc.publishedAt,
      kind: doc.kind,
      status: doc.status,
      url: doc.url,
      score,
      keywords: matched,
      snippet: snippet(doc.text, matched.length ? matched : primary),
    }));
  return { keywords, items };
}
