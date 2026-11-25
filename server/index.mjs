import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPublic } from "./fetch.mjs";
import { runSandbox } from "./sandbox.mjs";
import { listByDay, listPublications, publicationDates, today, yesterday } from "./daily.mjs";
import { listConsults, saveConsult } from "./store.mjs";
import { addSite, listSites, nameSite, removeSite, saveSite } from "./sites.mjs";
import { searchDocuments } from "./search.mjs";
import { searchWeb } from "./web-search.mjs";
import { actorFrom, audit, auditLog, basisView, grants, guard, login, modelView, saveBasis, saveGrants, saveModel } from "./guard.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const quarantine = path.join(root, "quarantine");
fs.mkdirSync(quarantine, { recursive: true });

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 512_000) {
        reject(Object.assign(new Error("请求体过大"), { code: "ELIMIT" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("请求体不是 JSON"), { code: "EBADJSON" }));
      }
    });
    req.on("error", reject);
  });
}

function publicResult(report, meta, record) {
  return {
    ok: true,
    url: meta.url,
    finalUrl: meta.finalUrl,
    hops: meta.hops,
    status: meta.status,
    contentType: meta.contentType,
    bytes: report.bytes,
    sha256: report.sha256,
    classification: report.classification,
    reason: report.reason,
    indicators: report.indicators,
    executed: false,
    title: report.title,
    excerpt: report.excerpt,
    paragraphs: Array.isArray(report.paragraphs) ? report.paragraphs : [],
    points: Array.isArray(report.points) ? report.points : [],
    links: Array.isArray(report.links) ? report.links : [],
    scriptCount: report.scriptCount,
    refine: report.refine ?? null,
    record,
    sandbox: report.sandbox,
  };
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

const pending = new Map();

async function inspectUrl(target, publishedAt = "") {
  const fetched = await fetchPublic(target);
  const file = path.join(quarantine, `${randomBytes(16).toString("hex")}.bin`);
  fs.writeFileSync(file, fetched.body);
  try {
    const report = await runSandbox({
      mode: "inspect",
      file,
      url: fetched.finalUrl,
      contentType: fetched.contentType,
      charset: fetched.charset,
    }, [file]);
    if (publishedAt && report.refine) report.refine.publishedAt = publishedAt;
    pending.set(fetched.finalUrl, { report, fetched });
    const record = listConsults().find((row) => row.finalUrl === fetched.finalUrl) ?? null;
    return publicResult(report, fetched, record);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

function dateFromPath(pathname) {
  const separated = pathname.match(/(20\d{2})[-/](1[0-2]|0?[1-9])[-/](3[01]|[12]\d|0?[1-9])(?!\d)/);
  if (separated) return `${separated[1]}-${separated[2].padStart(2, "0")}-${separated[3].padStart(2, "0")}`;
  const compact = pathname.match(/(20\d{2})(1[0-2]|0[1-9])(3[01]|[12]\d|0[1-9])(?!\d)/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const month = pathname.match(/(20\d{2})(1[0-2]|0[1-9])(?!\d)/);
  return month ? `${month[1]}-${month[2]}` : "";
}

function dateInPage(html) {
  const labeled = String(html).match(/class=["']pages-date["'][^>]*>\s*(20\d{2})-(1[0-2]|0[1-9])-(3[01]|[12]\d|0[1-9])/i);
  if (labeled) return `${labeled[1]}-${labeled[2]}-${labeled[3]}`;
  const text = String(html).replace(/<script[\s\S]*?<\/script>/gi, " ").slice(0, 12000);
  const written = text.match(/(20\d{2})年\s*(1[0-2]|0?[1-9])月\s*(3[01]|[12]\d|0?[1-9])日/);
  if (written) return `${written[1]}-${written[2].padStart(2, "0")}-${written[3].padStart(2, "0")}`;
  return "";
}

async function fillDates(items) {
  const pending = items.filter((item) => item.url && !/^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt || ""));
  await Promise.all(pending.map(async (item) => {
    try {
      const page = await fetchPublic(item.url);
      if (page.status !== 200) return;
      const date = dateInPage(page.body.toString("utf8"));
      if (date) item.publishedAt = date;
    } catch {
      // 单篇打不开时保留原来的月份。
    }
  }));
  return items;
}

function completeDate(value, url, dates) {
  const id = String(url || "").match(/content_(\d+)/)?.[1] || "";
  if (id && dates.get(id)) return dates.get(id);
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : (value || "");
}

function pagesOnSite(page, dates = new Map()) {
  let base;
  try {
    base = new URL(page.finalUrl);
  } catch {
    return [];
  }
  const seen = new Set();
  const items = [];
  for (const link of page.links || []) {
    let target;
    try {
      target = new URL(link.href, base);
    } catch {
      continue;
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") continue;
    if (target.hostname !== base.hostname) continue;
    if (target.port && target.port !== "80" && target.port !== "443") continue;
    target.hash = "";
    target.search = "";
    if (/\.(jpg|jpeg|png|gif|css|js|pdf|zip|docx?|xlsx?)$/i.test(target.pathname)) continue;
    if (!/\.s?html?$/i.test(target.pathname) && !/\/content_\d+/.test(target.pathname)) continue;
    const key = `${target.origin}${target.pathname}`;
    if (seen.has(key)) continue;
    const title = String(link.text || "").replace(/\s+/g, " ").trim();
    if (title.length < 8 || title.length > 80) continue;
    if (/首页|登录|注册|更多|繁体|无障碍|English|个人中心|网站声明|返回顶部|微博|微信|客户端|小程序|备案|版权/.test(title)) continue;
    seen.add(key);
    items.push({
      ok: true,
      id: "",
      title,
      publishedAt: completeDate(String(link.publishedAt || "") || dateFromPath(target.pathname), target.toString(), dates),
      publisher: "",
      infoKind: "",
      summary: "",
      points: [],
      url: target.toString(),
    });
    if (items.length >= 20) break;
  }
  if (!seen.has(`${base.origin}${base.pathname}`)) {
    items.unshift({
      ok: true,
      id: page.record?.id || "",
      title: page.refine?.title || page.title || base.hostname,
      publishedAt: completeDate(page.refine?.publishedAt || "", page.finalUrl, dates),
      publisher: page.refine?.publisher || "",
      infoKind: page.refine?.infoKind || "",
      summary: "",
      points: [],
      url: page.finalUrl,
    });
  }
  return items.slice(0, 20);
}

async function captureSite(target) {
  const page = await inspectUrl(target);
  if (page.status !== 200) throw Object.assign(new Error("这个网址没有打开"), { code: "EHTTP" });
  const final = new URL(page.finalUrl);
  const origin = `${final.origin}/`;
  const domain = final.hostname.replace(/^www\./, "");
  const section = final.pathname.replace(/\/+$/, "") || "/";
  const gov = final.hostname === "www.gov.cn" || final.hostname === "gov.cn";
  let dates = new Map();
  let listed = page;
  let label = page.refine?.title || page.title || domain;
  let items;
  if (gov && section === "/yaowen/liebiao") {
    try {
      items = await listPublications(20);
      label = "要闻最新";
    } catch {
      items = [];
    }
  }
  if (!items?.length) {
    if (gov) {
      try {
        dates = await publicationDates();
      } catch {
        dates = new Map();
      }
    }
    items = pagesOnSite(page, dates);
    const linked = items.filter((item) => item.url.replace(/\/$/, "") !== String(page.finalUrl || "").replace(/\/$/, ""));
    if (section !== "/" && linked.length === 0) {
      const home = await inspectUrl(origin);
      if (home.status === 200) {
        listed = home;
        items = pagesOnSite(home, dates);
        label = home.refine?.title || domain;
      }
    }
    items = await fillDates(items);
  }
  const site = saveSite({
    url: origin,
    domain,
    title: domain,
    host: final.hostname,
  });
  return { site, sites: listSites(), items, page: listed, label };
}

function confirmConsult(target) {
  const hit = pending.get(target);
  if (!hit) throw Object.assign(new Error("请先打开这篇咨询，再确认入库"), { code: "ENOTREADY" });
  if (hit.fetched.status !== 200 || hit.report.classification !== "文档" || !hit.report.refine) {
    throw Object.assign(new Error("这篇页面不能入库"), { code: "EREJECT" });
  }
  const record = saveConsult(hit.report, hit.fetched);
  if (!record) throw Object.assign(new Error("这篇页面不能入库"), { code: "EREJECT" });
  return publicResult(hit.report, hit.fetched, record);
}

function brief(result, source) {
  return {
    ok: true,
    id: result.record?.id || "",
    title: result.refine?.title || source.title,
    publishedAt: source.publishedAt || result.refine?.publishedAt || "",
    publisher: result.refine?.publisher || "",
    infoKind: result.refine?.infoKind || "",
    summary: result.refine?.summary || "",
    points: result.points || [],
    url: result.finalUrl,
  };
}

async function crawlDay(day) {
  const listed = await listByDay(day, 14);
  const items = [];
  let cursor = 0;
  async function worker() {
    while (cursor < listed.items.length) {
      const index = cursor;
      cursor += 1;
      const source = listed.items[index];
      try {
        items[index] = brief(await inspectUrl(source.url, source.publishedAt), source);
      } catch (error) {
        items[index] = {
          ok: false,
          id: "",
          title: source.title,
          publishedAt: source.publishedAt,
          publisher: "",
          infoKind: "",
          summary: error instanceof Error ? error.message : "抓取失败",
          points: [],
          url: source.url,
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, listed.items.length) }, () => worker()));
  return { day, items };
}

function sendHtml(res, html) {
  const payload = Buffer.from(html);
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-length": payload.length,
  });
  res.end(payload);
}

function page(title, body) {
  return `<!doctype html>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  body { margin: 32px auto; max-width: 720px; font: 16px/1.6 "Segoe UI", sans-serif; color: #0f172a; }
  a { color: #1e3a8a; }
  code, input { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; }
  input { width: min(100%, 420px); }
  button { background: #1e3a8a; color: #fff; border: 0; border-radius: 8px; padding: 8px 14px; }
  li { margin: 4px 0; }
</style>
<h1>${esc(title)}</h1>
${body}`;
}

function homePage() {
  return page("咨询抓取", `
<p>填写公网网址后抓取。页面只作为数据进入沙盒，不执行脚本，不启动程序。工作台在 <a href="http://127.0.0.1:5173/">http://127.0.0.1:5173/</a> 的「网络咨询」。</p>
<form action="/api/consult/fetch" method="get">
  <input name="url" value="https://www.gov.cn/yaowen/liebiao/202611/content_7086792.htm" aria-label="咨询网址">
  <button type="submit">抓取</button>
</form>`);
}

function resultPage(result) {
  const refine = result.refine || {};
  const checks = (result.sandbox?.items || []).map((item) => `<li>${esc(item.name)}：${item.result === "denied" ? "已拒绝" : "未拦住"}</li>`).join("");
  const record = result.record
    ? `<p>已写入咨询库 ${esc(result.record.id)}，类别 ${esc(result.record.infoKind)}。</p>`
    : "<p>可疑文件未写入咨询库。</p>";
  return page(refine.title || result.title || "抓取结果", `
<p><a href="/">返回</a></p>
${record}
<ul>
  <li>状态 ${esc(result.status)} · ${esc(result.contentType)} · ${esc(result.bytes)} 字节</li>
  <li>文号 ${esc(refine.docNo || "未识别")}</li>
  <li>发布 ${esc(refine.publisher || "未识别")} · ${esc(refine.publishedAt || "未识别")}</li>
  <li>脚本 ${esc(result.scriptCount)} 个，未执行</li>
  <li>堆上限 ${esc(result.sandbox?.heapLimitMb)} MB</li>
</ul>
${(result.paragraphs?.length ? result.paragraphs : [refine.summary || result.reason]).map((item) => `<p>${esc(item)}</p>`).join("")}
<ul>${checks}</ul>`);
}

async function handleAdmin(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const session = login(String(body.username || "").trim(), String(body.password || ""));
    if (!session) {
      send(res, 401, { ok: false, error: "账号或密码不正确" });
      return true;
    }
    send(res, 200, { ok: true, ...session });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/permissions") {
    send(res, 200, { ok: true, grants: grants() });
    return true;
  }
  if (req.method === "PUT" && url.pathname === "/api/permissions") {
    const denied = guard(req, "grant");
    if (denied) {
      send(res, denied.status, denied.body);
      return true;
    }
    const body = await readBody(req);
    send(res, 200, { ok: true, grants: saveGrants(actorFrom(req), body.grants || body) });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/model") {
    const denied = guard(req, "model");
    if (denied) {
      send(res, denied.status, denied.body);
      return true;
    }
    send(res, 200, { ok: true, model: modelView() });
    return true;
  }
  if (req.method === "PUT" && url.pathname === "/api/model") {
    const denied = guard(req, "model");
    if (denied) {
      send(res, denied.status, denied.body);
      return true;
    }
    const body = await readBody(req);
    send(res, 200, { ok: true, model: saveModel(actorFrom(req), body) });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/basis") {
    send(res, 200, { ok: true, ...basisView() });
    return true;
  }
  if (req.method === "PUT" && url.pathname === "/api/basis") {
    const denied = guard(req, "basis");
    if (denied) {
      send(res, denied.status, denied.body);
      return true;
    }
    const body = await readBody(req);
    send(res, 200, { ok: true, ...saveBasis(actorFrom(req), body) });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/audit") {
    const denied = guard(req, "audit");
    if (denied) {
      send(res, denied.status, denied.body);
      return true;
    }
    send(res, 200, { ok: true, items: auditLog() });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/audit") {
    const actor = actorFrom(req);
    if (!actor) {
      send(res, 401, { ok: false, error: "请先登录" });
      return true;
    }
    const body = await readBody(req);
    const event = String(body.event || "");
    const need = event === "审核退回" ? "review" : event === "资料归集" ? "intake" : "";
    const denied = need ? guard(req, need) : { status: 403, body: { ok: false, error: "不能记这条日志" } };
    if (denied) {
      send(res, denied.status, denied.body);
      return true;
    }
    audit(actor, event, body.detail || "");
    send(res, 200, { ok: true });
    return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  try {
    if (await handleAdmin(req, res, url)) return;
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/api")) {
      sendHtml(res, homePage());
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      send(res, 200, { ok: true, service: "gov-consult", sandbox: "node-permission", listen: "127.0.0.1:8787", workbench: "http://127.0.0.1:5173/" });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/consults") {
      send(res, 200, { ok: true, items: listConsults() });
      return;
    }
    if (url.pathname === "/api/consult/yesterday" && (req.method === "GET" || req.method === "POST")) {
      if (req.method === "GET") {
        const day = yesterday();
        const listed = await listByDay(day, 14);
        const saved = listConsults();
        const items = listed.items
          .map((source) => saved.find((row) => row.finalUrl === source.url))
          .filter(Boolean)
          .map((row) => ({
            ok: true,
            id: row.id,
            title: row.title,
            publishedAt: row.publishedAt,
            publisher: row.publisher,
            infoKind: row.infoKind,
            summary: row.summary,
            points: [],
            url: row.finalUrl,
          }));
        send(res, 200, { ok: true, day, items });
        return;
      }
      send(res, 200, { ok: true, ...(await crawlDay(yesterday())) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/consult/today") {
      send(res, 200, { ok: true, ...(await crawlDay(today())) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/sandbox/probe") {
      const report = await runSandbox({ mode: "probe" });
      send(res, 200, { ok: true, executed: false, sandbox: report.sandbox });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/search") {
      const body = await readBody(req);
      const query = String(body.query || "").trim();
      if (!query) {
        send(res, 400, { ok: false, error: "请填写要检索的关键词" });
        return;
      }
      const found = searchDocuments(query, Array.isArray(body.pages) ? body.pages : []);
      send(res, 200, { ok: true, engine: "keyword", query, ...found });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/search/web") {
      const body = await readBody(req);
      const query = String(body.query || "").trim();
      if (!query) {
        send(res, 400, { ok: false, error: "请填写要检索的内容" });
        return;
      }
      const found = await searchWeb(query);
      send(res, 200, { ok: true, engine: "web", query, ...found });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/consult/sites") {
      send(res, 200, { ok: true, sites: listSites() });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/consult/site") {
      const body = await readBody(req);
      const target = String(body.url || "").trim();
      if (!target) {
        send(res, 400, { ok: false, error: "请填写网址或官网" });
        return;
      }
      send(res, 200, { ok: true, ...(await captureSite(target)) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/consult/site/add") {
      const body = await readBody(req);
      const target = String(body.url || "").trim();
      const name = String(body.name || "").trim();
      if (!target) {
        send(res, 400, { ok: false, error: "请填写网页地址" });
        return;
      }
      send(res, 200, { ok: true, sites: addSite(target, name) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/consult/site/name") {
      const body = await readBody(req);
      const target = String(body.url || "").trim();
      const name = String(body.name || "").trim();
      if (!target) {
        send(res, 400, { ok: false, error: "请选择要备注的网址" });
        return;
      }
      send(res, 200, { ok: true, sites: nameSite(target, name) });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/consult/site/remove") {
      const denied = guard(req, "siteRemove");
      if (denied) {
        send(res, denied.status, denied.body);
        return;
      }
      const body = await readBody(req);
      const target = String(body.url || "").trim();
      const sites = removeSite(target);
      audit(actorFrom(req), "删除网址", target);
      send(res, 200, { ok: true, sites });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/consult/save") {
      const denied = guard(req, "consultSave");
      if (denied) {
        send(res, denied.status, denied.body);
        return;
      }
      const body = await readBody(req);
      const target = String(body.url || "").trim();
      if (!target) {
        send(res, 400, { ok: false, error: "请先打开要入库的咨询" });
        return;
      }
      const saved = confirmConsult(target);
      audit(actorFrom(req), "确认入库", target);
      send(res, 200, saved);
      return;
    }
    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/consult/fetch") {
      const body = req.method === "POST" ? await readBody(req) : {};
      const target = String(body.url || url.searchParams.get("url") || "").trim();
      const browser = req.method === "GET" && String(req.headers.accept || "").includes("text/html");
      if (!target) {
        if (browser) {
          sendHtml(res, homePage());
          return;
        }
        send(res, 400, { ok: false, error: "请填写要抓取的咨询网址" });
        return;
      }
      const result = await inspectUrl(target);
      if (browser) {
        sendHtml(res, resultPage(result));
        return;
      }
      send(res, 200, result);
      return;
    }
    send(res, 404, { ok: false, error: "没有这个接口" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "抓取失败";
    if (req.method === "GET" && String(req.headers.accept || "").includes("text/html")) {
      sendHtml(res, page("抓取失败", `<p>${esc(message)}</p><p><a href="/">返回</a></p>`));
      return;
    }
    send(res, 400, { ok: false, error: message });
  }
});

server.listen(8787, "127.0.0.1", () => {
  console.log("consult api http://127.0.0.1:8787");
});
