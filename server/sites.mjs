import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "sites.json");

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

export function listSites() {
  return readAll();
}

function fail(message) {
  return Object.assign(new Error(message), { code: "EBADURL" });
}

export function canonicalSite(raw) {
  const text = String(raw || "").trim();
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw fail("网址格式不正确");
  }
  if (parsed.username || parsed.password) throw fail("网址不能包含账号口令");
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw fail("只保存 http 或 https 网址");
  const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
  if (port !== 80 && port !== 443) throw fail("只保存 80 和 443 端口");
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) throw fail("不保存本机地址");
  parsed.hostname = host;
  parsed.hash = "";
  parsed.search = "";
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed;
}

function sameSite(left, right) {
  try {
    return canonicalSite(left).toString() === canonicalSite(right).toString();
  } catch {
    return left === right;
  }
}

export function saveSite(site) {
  const parsed = canonicalSite(site.url);
  const url = parsed.toString();
  const domain = parsed.hostname.replace(/^www\./, "");
  const records = readAll();
  const now = new Date().toISOString();
  const existing = records.find((item) => sameSite(item.url, url));
  const next = {
    url,
    domain,
    host: parsed.hostname,
    title: site.title || domain,
  };
  if (site.name !== undefined) next.name = String(site.name || "").trim().slice(0, 40);
  if (existing) {
    const keptName = existing.name || "";
    Object.assign(existing, next, { updatedAt: now });
    if (site.name === undefined) existing.name = keptName;
    writeAll(records);
    return existing;
  }
  const maxId = records.reduce((max, item) => {
    const matched = /^ST-(\d+)$/.exec(item.id || "");
    return matched ? Math.max(max, Number(matched[1])) : max;
  }, 0);
  const created = {
    id: `ST-${String(maxId + 1).padStart(3, "0")}`,
    ...next,
    savedAt: now,
    updatedAt: now,
  };
  records.unshift(created);
  writeAll(records.slice(0, 40));
  return created;
}

export function addSite(rawUrl, name = "") {
  saveSite({ url: rawUrl, name: String(name || "").trim().slice(0, 40) });
  return listSites();
}

export function nameSite(rawUrl, name = "") {
  const records = readAll();
  const found = records.find((item) => sameSite(item.url, rawUrl));
  if (!found) throw fail("还没有这条网址");
  found.name = String(name || "").trim().slice(0, 40);
  found.updatedAt = new Date().toISOString();
  writeAll(records);
  return records;
}

export function removeSite(url) {
  const records = readAll().filter((item) => !sameSite(item.url, url));
  writeAll(records);
  return records;
}
