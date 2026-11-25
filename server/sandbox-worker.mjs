import crypto from "node:crypto";
import dns from "node:dns";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import v8 from "node:v8";
import { spawnSync } from "node:child_process";

function denied() {
  throw Object.assign(new Error("沙盒拒绝访问网络"), { code: "ERR_ACCESS_DENIED" });
}

net.Socket.prototype.connect = function connect() {
  throw denied();
};
net.connect = denied;
net.createConnection = denied;
tls.connect = denied;
for (const name of ["lookup", "resolve", "resolve4", "resolve6"]) {
  dns[name] = denied;
  if (dns.promises) dns.promises[name] = denied;
}
http.request = denied;
http.get = denied;
https.request = denied;
https.get = denied;
globalThis.fetch = denied;

function attempt(name, resource, fn) {
  try {
    const value = fn();
    return { name, resource, result: "allowed", detail: value == null ? "" : String(value) };
  } catch (error) {
    return {
      name,
      resource,
      result: "denied",
      code: error && error.code ? String(error.code) : "ERR_ACCESS_DENIED",
    };
  }
}

function checks() {
  const heapLimitMb = Math.round(v8.getHeapStatistics().heap_size_limit / 1024 / 1024);
  return {
    heapLimitMb,
    items: [
      attempt("读取系统文件", "C:\\Windows\\win.ini", () => {
        fs.readFileSync("C:\\Windows\\win.ini");
      }),
      attempt("写入系统目录", "C:\\Windows\\Temp\\gov-sandbox-probe.txt", () => {
        fs.writeFileSync("C:\\Windows\\Temp\\gov-sandbox-probe.txt", "probe");
      }),
      attempt("启动程序访问注册表", "reg query HKCU", () => {
        spawnSync("reg", ["query", "HKCU"]);
      }),
      attempt("打开网络套接字", "1.1.1.1:443", () => {
        net.connect(443, "1.1.1.1");
      }),
      attempt("发起网页请求", "https://example.com", () => {
        https.get("https://example.com");
      }),
      attempt("加载原生插件", "tcp_wrap", () => {
        const binding = process.binding || process._linkedBinding;
        if (typeof binding !== "function") throw Object.assign(new Error("binding unavailable"), { code: "ERR_ACCESS_DENIED" });
        binding("tcp_wrap");
      }),
    ],
  };
}

function classify(buf, contentType, url) {
  const head = buf.subarray(0, 8);
  const ext = (() => {
    try {
      return new URL(url).pathname.split(".").pop()?.toLowerCase() ?? "";
    } catch {
      return "";
    }
  })();
  const riskyExt = new Set(["exe", "dll", "ps1", "bat", "cmd", "vbs", "js", "mjs", "cjs", "scr", "msi", "reg", "com", "hta", "jar", "wsf", "sys"]);
  if (head[0] === 0x4d && head[1] === 0x5a) return { kind: "可疑文件", reason: "PE 可执行文件" };
  if (head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) return { kind: "可疑文件", reason: "ELF 可执行文件" };
  if (riskyExt.has(ext)) return { kind: "可疑文件", reason: `扩展名 .${ext}` };
  if (/javascript|x-msdownload|x-sh|x-bat|dosexec/i.test(contentType)) return { kind: "可疑文件", reason: contentType };
  return { kind: "文档", reason: contentType || "text" };
}

function indicators(buf) {
  const text = buf.toString("latin1");
  const rules = [
    ["注册表 HKLM", /HKLM|HKEY_LOCAL_MACHINE/i],
    ["注册表 HKCU", /HKCU|HKEY_CURRENT_USER/i],
    ["启动项", /CurrentVersion\\Run/i],
    ["PowerShell", /powershell/i],
    ["命令解释器", /cmd\.exe/i],
    ["注册表命令", /\breg(\.exe)?\s+(add|query|delete)/i],
  ];
  return rules.filter(([, rule]) => rule.test(text)).map(([label]) => label);
}

const INFO_KINDS = [
  ["政策解读", /解读|一图读懂|政策图解/],
  ["通知公告", /通知|公告|通告|公示/],
  ["咨询答复", /答复|问政|来信/],
  ["会议精神", /讲话|会晤|会见|主持|峰会|寄语|座谈会|会议精神|工作会议/],
  ["国家政策", /蓝图|宣言|展望|指示|调研|规划|国务院|国办|条例|办法|规定|意见|方案|决定/],
];

function cleanTitle(title) {
  const parts = title.split(/[_|\-｜—–]/).map((part) => part.trim()).filter(Boolean);
  return (parts[0] || title).replace(/\s+/g, " ").trim().slice(0, 80);
}

function normalizeDate(raw) {
  const match = String(raw).match(/(20\d{2})\D{1,3}(1[0-2]|0[1-9]|[1-9])\D{1,3}(3[01]|[12]\d|0[1-9]|[1-9])/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function pickDate(text) {
  const wire = text.match(/(20\d{2})年\s*(1[0-2]|0?[1-9])月\s*(3[01]|[12]\d|0?[1-9])日电/);
  if (wire) return `${wire[1]}-${wire[2].padStart(2, "0")}-${wire[3].padStart(2, "0")}`;
  const shortWire = text.match(/(1[0-2]|0?[1-9])月\s*(3[01]|[12]\d|0?[1-9])日电/);
  const year = text.match(/20\d{2}/);
  if (shortWire && year) return `${year[0]}-${shortWire[1].padStart(2, "0")}-${shortWire[2].padStart(2, "0")}`;
  const labeled = text.match(/(?:发布日期|成文日期|发文日期|发布时间)[:：\s]*((?:20\d{2})[年\-/.](?:1[0-2]|0?[1-9])[月\-/.](?:3[01]|[12]\d|0?[1-9])日?)/);
  if (labeled) return normalizeDate(labeled[1]);
  const iso = text.match(/(20\d{2})-(1[0-2]|0[1-9])-(3[01]|[12]\d|0[1-9])/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const any = text.match(/20\d{2}[年\-/.](?:1[0-2]|0?[1-9])[月\-/.](?:3[01]|[12]\d|0?[1-9])日?/);
  return any ? normalizeDate(any[0]) : "";
}

function pickDocNo(text) {
  const labeled = text.match(/(?:发文字号|文号|编号)[:：\s]*([^\s，。；]{4,40})/);
  if (labeled && /号|〔|\[|［/.test(labeled[1])) return labeled[1].replace(/\s+/g, "");
  const formal = text.match(/[\u4e00-\u9fa5A-Za-z]{1,16}[〔\[［]\s*20\d{2}\s*[〕\]］]\s*\d{1,4}\s*号/);
  return formal ? formal[0].replace(/\s+/g, "") : "";
}

function pickPublisher(text) {
  const labeled = text.match(/(?:发布机关|发文机关|发布单位|主办单位|来源)[:：\s]*([\u4e00-\u9fa5A-Za-z0-9（）()]{2,40})/);
  if (labeled) return labeled[1].trim();
  const dateline = text.match(/(新华社|人民日报)/);
  if (dateline) return dateline[1];
  const org = text.match(/[\u4e00-\u9fa5]{2,24}(?:人民政府办公厅|人民政府|办公厅|办公室|管理委员会|委员会|管理局|服务中心)/);
  return org ? org[0] : "";
}

function pickKind(title, text) {
  const blob = `${title} ${text.slice(0, 500)}`;
  const found = INFO_KINDS.find(([, rule]) => rule.test(blob));
  return found ? found[0] : "其他";
}

function pickTags(title, text, infoKind) {
  const blob = `${title} ${text}`;
  const words = ["便民服务", "数据报送", "数据共享", "政务服务", "街道", "办件", "政策解读", "会议", "通知", "咨询"];
  const tags = [infoKind, ...words.filter((word) => blob.includes(word))];
  return [...new Set(tags)].slice(0, 6);
}

function pickSummary(fullTitle, title, text, paragraphs) {
  if (paragraphs.length > 0) return paragraphs[0].slice(0, 280);
  const body = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(fullTitle, " ")
    .replace(title, " ")
    .replace(/\s+/g, " ")
    .trim();
  const dated = body.search(/\d{1,2}月\d{1,2}日/);
  const article = dated >= 0 ? body.slice(dated) : body;
  const sentences = article.split(/(?<=[。！？])/).map((item) => item.trim()).filter((item) => item.length >= 12);
  return (sentences.slice(0, 2).join("") || article).slice(0, 280);
}

function refineDocument(title, text, paragraphs) {
  const cleaned = cleanTitle(title);
  const source = paragraphs.length > 0 ? paragraphs.join("\n") : text;
  const infoKind = pickKind(cleaned, source);
  return {
    title: cleaned,
    publishedAt: pickDate(text),
    docNo: pickDocNo(source) || pickDocNo(text),
    publisher: pickPublisher(source) || pickPublisher(text),
    summary: pickSummary(title, cleaned, source, paragraphs),
    tags: pickTags(cleaned, source, infoKind),
    infoKind,
  };
}

function decodeDocument(buf, contentType, charset) {
  const head = buf.subarray(0, 4096).toString("latin1");
  const fromType = /charset\s*=\s*["']?\s*([\w.-]+)/i.exec(contentType || "");
  const meta = /charset\s*=\s*["']?\s*([\w.-]+)/i.exec(head);
  const label = String(charset || fromType?.[1] || meta?.[1] || "utf-8").toLowerCase();
  const alias = { gb2312: "gb18030", gbk: "gb18030", gb18030: "gb18030", utf8: "utf-8", "utf-8": "utf-8" };
  const encoding = alias[label] || (/^utf-?8$/i.test(label) ? "utf-8" : label);
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(buf);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  }
}

function visibleText(fragment) {
  return fragment
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function articleRegion(raw) {
  const match = /<[^>]*\bid=["']UCAP-CONTENT["'][^>]*>|<[^>]*\bclass=["'][^"']*\b(?:pages_content|trs_editor_view)\b[^"']*["'][^>]*>/i.exec(raw);
  return match ? raw.slice(match.index, match.index + 80000) : raw;
}

function headerText(raw) {
  const ucap = raw.indexOf("UCAP-CONTENT");
  const cut = ucap >= 0 ? ucap : raw.search(/pages_content|trs_editor_view/);
  const head = (cut > 0 ? raw.slice(0, cut) : raw.slice(0, 8000))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<meta\b[^>]*content=["']([^"']+)["'][^>]*>/gi, " $1 ");
  return visibleText(head);
}

function bylineText(raw) {
  const region = articleRegion(raw).slice(0, 1800);
  return visibleText(region.replace(/<p\b[\s\S]*$/i, " "));
}

function isTitleEcho(item, title) {
  const rest = item.replace(/^[^。]{0,40}电\s*/, "").trim();
  if (title && (item === title || rest === title)) return true;
  return /^[^。]{0,40}电\s*$/.test(item);
}

function isCaption(item) {
  return /摄$|摄影[:：]|图片来源|（记者|^新华社记者|记者\s*\S{1,12}\s*摄/.test(item);
}

function condense(paragraphs, title) {
  const body = paragraphs.filter((item) => !/电\s*题：/.test(item) && !isTitleEcho(item, title) && !isCaption(item) && !(title && item.startsWith(title)));
  const claim = paragraphs.find((item) => /点主张|要点/.test(item)) || "";
  const points = (claim.match(/提出\d*点(?:主张|要求|措施)[:：]([^。]+)/)?.[1] || "")
    .split("、")
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 16);
  const kept = (body.length > 0 ? body : paragraphs).slice(0, 80);
  return { paragraphs: kept, points: points.slice(0, 8) };
}

function articleParagraphs(raw) {
  const region = articleRegion(raw);
  const found = [];
  const pattern = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let match = pattern.exec(region);
  while (match) {
    const text = visibleText(match[1]);
    const pipes = text.match(/\|/g)?.length ?? 0;
    if (/版权所有|网站标识码|京ICP备|京公网安备|微博、微信/.test(text)) break;
    const heading = /^(支柱[一二三四五六七八九十\d]+|[一二三四五六七八九十]+、|（[一二三四五六七八九十]+）|第[一二三四五六七八九十\d]+[章节部分条])/.test(text)
      || (text.length >= 2 && text.length <= 22 && !/[。！？；]/.test(text));
    const noisy = (!heading && text.length < 8) || pipes >= 2 || /无障碍|主办单位|责任编辑|相关稿件|点击跳转|个人中心|网站声明|https?:\/\//.test(text);
    if (!noisy) found.push(text);
    if (found.length >= 80) break;
    match = pattern.exec(region);
  }
  return found;
}

function dateFromHref(href) {
  const path = href.split("?")[0];
  const separated = path.match(/(20\d{2})[-/](1[0-2]|0?[1-9])[-/](3[01]|[12]\d|0?[1-9])(?!\d)/);
  if (separated) return `${separated[1]}-${separated[2].padStart(2, "0")}-${separated[3].padStart(2, "0")}`;
  const compact = path.match(/(20\d{2})(1[0-2]|0[1-9])(3[01]|[12]\d|0[1-9])(?!\d)/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const month = path.match(/(20\d{2})(1[0-2]|0[1-9])(?!\d)/);
  return month ? `${month[1]}-${month[2]}` : "";
}

function imageDate(region, index, length) {
  const markers = ["<li", "class=\"item\"", "<h2"];
  let start = Math.max(0, index - 500);
  for (const marker of markers) {
    const at = region.lastIndexOf(marker, index);
    if (at >= 0 && index - at < 1500) start = Math.max(start, at);
  }
  const slice = region.slice(start, Math.min(region.length, index + length + 300));
  const image = slice.match(/W0(20\d{2})(1[0-2]|0[1-9])(3[01]|[12]\d|0[1-9])/);
  return image ? `${image[1]}-${image[2]}-${image[3]}` : "";
}

function linkDate(href, text, region, index, length) {
  const fromText = pickDate(text);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromText)) return fromText;
  const liStart = region.lastIndexOf("<li", index);
  const liEnd = region.indexOf("</li>", index + length);
  if (liStart >= 0 && liEnd > index && liEnd - liStart < 900) {
    const fromItem = pickDate(visibleText(region.slice(liStart, liEnd)));
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromItem)) return fromItem;
  }
  const pictured = imageDate(region, index, length);
  if (pictured) return pictured;
  const fromHref = dateFromHref(href);
  return /^\d{4}-\d{2}-\d{2}$/.test(fromHref) ? fromHref : (fromText || fromHref);
}

function extractLinks(raw) {
  const cut = raw.search(/版权所有|网站标识码|京ICP备/);
  const region = cut > 0 ? raw.slice(0, cut) : raw;
  const found = [];
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match = pattern.exec(region);
  while (match) {
    const text = visibleText(match[2]);
    if (text && text.length <= 80) {
      found.push({
        href: match[1].trim(),
        text,
        publishedAt: linkDate(match[1].trim(), text, region, match.index, match[0].length),
      });
    }
    if (found.length >= 80) break;
    match = pattern.exec(region);
  }
  return found;
}

function extractDocument(buf, contentType, charset) {
  const raw = decodeDocument(buf, contentType, charset);
  const scriptCount = (raw.match(/<script\b/gi) || []).length;
  const title = (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const rawParagraphs = articleParagraphs(raw);
  const condensed = condense(rawParagraphs, cleanTitle(title));
  const paragraphs = condensed.paragraphs;
  const points = condensed.points;
  const excerpt = paragraphs.join("\n\n");
  const header = `${headerText(raw)}\n${bylineText(raw)}\n${rawParagraphs.slice(0, 2).join("\n")}`;
  return { title, excerpt, paragraphs, points, header, links: extractLinks(raw), scriptCount, executed: false };
}

function readJob() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    process.stdin.on("error", reject);
  });
}

const job = await readJob();
const sandbox = checks();

if (job.mode === "probe") {
  process.stdout.write(JSON.stringify({ ok: true, mode: "probe", executed: false, sandbox }));
  process.exit(0);
}

const buf = fs.readFileSync(job.file);
const fileClass = classify(buf, job.contentType || "", job.url || "");
const found = indicators(buf);
const extracted = fileClass.kind === "文档"
  ? extractDocument(buf, job.contentType || "", job.charset || "")
  : { title: "", excerpt: "", paragraphs: [], points: [], header: "", links: [], scriptCount: 0, executed: false };

process.stdout.write(JSON.stringify({
  ok: true,
  mode: "inspect",
  sha256: crypto.createHash("sha256").update(buf).digest("hex"),
  bytes: buf.length,
  classification: fileClass.kind,
  reason: fileClass.reason,
  indicators: found,
  executed: false,
  title: extracted.title,
  excerpt: extracted.excerpt,
  paragraphs: extracted.paragraphs,
  points: extracted.points,
  links: extracted.links,
  scriptCount: extracted.scriptCount,
  refine: fileClass.kind === "文档" ? refineDocument(extracted.title, `${extracted.header}\n${extracted.excerpt}`, extracted.paragraphs) : null,
  sandbox,
}));
