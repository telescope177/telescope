import { fetchPublic } from "./fetch.mjs";
import { answerFromSources } from "./deepseek.mjs";

const ENCYCLOPEDIA = new Set([
  "baike.baidu.com",
  "baike.sogou.com",
  "baike.so.com",
  "zh.wikipedia.org",
  "wikipedia.org",
]);

const NATIONAL_GOV = new Set([
  "gov.cn",
  "www.gov.cn",
  "gjzwfw.gov.cn",
  "npc.gov.cn",
  "cppcc.gov.cn",
  "court.gov.cn",
  "spp.gov.cn",
  "mfa.gov.cn",
  "ndrc.gov.cn",
  "moe.gov.cn",
  "most.gov.cn",
  "miit.gov.cn",
  "mof.gov.cn",
  "mofcom.gov.cn",
  "mps.gov.cn",
  "mca.gov.cn",
  "mohrss.gov.cn",
  "mnr.gov.cn",
  "mee.gov.cn",
  "mohurd.gov.cn",
  "mot.gov.cn",
  "mwr.gov.cn",
  "mara.gov.cn",
  "mct.gov.cn",
  "nhc.gov.cn",
  "mem.gov.cn",
  "pbc.gov.cn",
  "audit.gov.cn",
  "customs.gov.cn",
  "stats.gov.cn",
  "samr.gov.cn",
  "nrta.gov.cn",
  "sport.gov.cn",
  "chinatax.gov.cn",
  "safe.gov.cn",
  "csrc.gov.cn",
  "nfra.gov.cn",
]);

function decode(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function publicHttp(raw) {
  try {
    const parsed = new URL(decode(raw));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
    if (port !== 80 && port !== 443) return "";
    const host = parsed.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return "";
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function bingDate(value) {
  const text = decode(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const dayFirst = text.match(/(3[01]|[12]\d|0?[1-9])\s*(1[0-2]|0?[1-9])月\s*(20\d{2})/);
  if (dayFirst) return `${dayFirst[3]}-${dayFirst[2].padStart(2, "0")}-${dayFirst[1].padStart(2, "0")}`;
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return "";
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function bingItems(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map((item) => {
    const url = publicHttp(item[1].match(/<link>([\s\S]*?)<\/link>/)?.[1] || "");
    const title = decode(item[1].match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
    if (!url || title.length < 4) return null;
    if (/bing\.com$/i.test(hostOf(url))) return null;
    const published = bingDate(item[1].match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "");
    return {
      title: title.slice(0, 80),
      url,
      snippet: decode(item[1].match(/<description>([\s\S]*?)<\/description>/)?.[1] || "").slice(0, 140),
      source: hostOf(url),
      publishedAt: published,
      kind: "公网",
    };
  }).filter(Boolean);
}

function govDate(item) {
  const labeled = String(item.pubtimeStr || "").trim();
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(labeled)) return labeled.replace(/\./g, "-");
  const stamp = Number(item.ptime);
  if (stamp > 1000000000000) return new Date(stamp).toISOString().slice(0, 10);
  return "";
}

function govItems(json) {
  const cat = json?.searchVO?.catMap || {};
  const lists = ["gongwen", "zhongyangfile", "otherfile"].flatMap((name) => (
    Array.isArray(cat[name]?.listVO) ? cat[name].listVO : []
  ));
  return lists.map((item) => {
    const url = publicHttp(item.url || "");
    const title = decode(item.title || "");
    if (!url || title.length < 4) return null;
    return {
      title: title.slice(0, 80),
      url,
      snippet: decode(item.summary || "").slice(0, 140),
      source: decode(item.fwdw || "") || "中国政府网",
      publishedAt: govDate(item),
      kind: "政府网",
      docNo: decode(item.pcode || ""),
    };
  }).filter(Boolean);
}

function unique(items) {
  const seen = new Set();
  const kept = [];
  for (const item of items) {
    const key = item.url ? item.url.replace(/\/$/, "") : item.title;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(item);
  }
  return kept;
}

function coreTerms(query) {
  const latin = [...new Set((query.match(/[A-Za-z][A-Za-z0-9.+-]{1,}/g) || []).map((item) => item.trim()))];
  const generic = new Set(["国家", "地区", "成员", "成员国", "经济体", "情况", "介绍", "概况", "内容", "问题"]);
  const chinese = [...new Set(query
    .replace(/[A-Za-z0-9.+-]+/g, " ")
    .replace(/有哪些|哪些|是什么|什么是|如何|怎么|怎样|为什么|是否|吗|呢|请问/g, " ")
    .split(/[\s,，。？?！!、的了和与在对把]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !generic.has(item)))];
  return { latin, chinese };
}

function searchPhrase(query) {
  const terms = coreTerms(query);
  const phrase = [...terms.latin, ...terms.chinese].slice(0, 3).join(" ");
  return phrase || query;
}

function matches(item, query) {
  const terms = coreTerms(query);
  const required = terms.latin.length ? terms.latin : terms.chinese;
  if (!required.length) return true;
  const hay = `${item.title} ${item.snippet}`.toLowerCase();
  return required.some((term) => hay.includes(term.toLowerCase()));
}

function plainPage(html) {
  return decode(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " "));
}

function relevantSlice(text, query) {
  const anchors = /有哪些|哪些|成员|名单|国家/.test(query)
    ? ["成员和观察员", "成员国", "现有成员", "成员"]
    : [];
  const terms = coreTerms(query);
  anchors.push(...terms.latin, ...terms.chinese);
  const lower = text.toLowerCase();
  for (const anchor of anchors) {
    const at = lower.indexOf(String(anchor).toLowerCase());
    if (at >= 0) return text.slice(Math.max(0, at - 80), at + 1500);
  }
  return text.slice(0, 1600);
}

async function readPage(url, query) {
  try {
    const page = await fetchPublic(url);
    if (page.status !== 200) return "";
    const text = plainPage(page.body.toString("utf8")).replace(/\s+/g, " ").trim();
    if (/安全验证|请完成验证|访问验证/.test(text.slice(0, 240))) return "";
    return relevantSlice(text, query);
  } catch {
    return "";
  }
}

function byNewest(items) {
  return [...items].sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));
}

function focusOf(item) {
  const host = hostOf(item.url);
  if (ENCYCLOPEDIA.has(host)) return "权威百科";
  if (item.kind === "政府网" || NATIONAL_GOV.has(host)) return "国家政务";
  return "";
}

function pickNewest(items, limit) {
  const ordered = byNewest(items);
  const dated = ordered.filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt || ""));
  const undated = ordered.filter((item) => !/^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt || ""));
  if (!dated.length) return ordered.slice(0, limit);
  const year = dated[0].publishedAt.slice(0, 4);
  const same = dated.filter((item) => item.publishedAt.startsWith(year));
  return [...(same.length >= 2 ? same : dated), ...undated].slice(0, limit);
}

function spreadHosts(items, perHost, limit) {
  const counts = new Map();
  const kept = [];
  for (const item of items) {
    const host = hostOf(item.url) || item.source || item.title;
    const used = counts.get(host) || 0;
    if (used >= perHost) continue;
    counts.set(host, used + 1);
    kept.push(item);
    if (kept.length >= limit) break;
  }
  return kept;
}

function briefAnswer(items) {
  const parts = [];
  for (const item of items) {
    if ((item.snippet || "").length < 24) continue;
    parts.push(item.snippet);
    if (parts.length >= 2) break;
  }
  return parts.join(" ").slice(0, 280);
}

export async function searchWeb(query) {
  const q = String(query || "").replace(/\s+/g, " ").trim();
  if (!q) return { keywords: [], items: [], answer: "", sources: [] };
  const encoded = encodeURIComponent(searchPhrase(q));
  const jobs = await Promise.allSettled([
    fetchPublic(`https://www.bing.com/search?q=${encoded}&format=rss&count=15`),
    fetchPublic(`https://sousuo.www.gov.cn/search-gov/data?t=zhengce&q=${encoded}&sort=pubtime&sortType=1&searchfield=&p=0&n=10&type=gwyzcwjk`),
  ]);
  const web = [];
  const sources = [];
  if (jobs[0].status === "fulfilled" && jobs[0].value.status === 200) {
    const found = bingItems(jobs[0].value.body.toString("utf8")).filter((item) => matches(item, q) && focusOf(item));
    web.push(...found.map((item) => ({ ...item, kind: focusOf(item) })));
    if (found.some((item) => focusOf(item) === "权威百科")) sources.push("权威百科");
  }
  if (jobs[1].status === "fulfilled" && jobs[1].value.status === 200) {
    try {
      const found = byNewest(govItems(JSON.parse(jobs[1].value.body.toString("utf8"))).filter((item) => matches(item, q))).slice(0, 8);
      web.push(...found.map((item) => ({ ...item, kind: "国家政务" })));
      if (found.length) sources.push("国家政务平台");
    } catch {
      // 政府网结果不是可解析的 JSON 时，只保留另一路结果。
    }
  }
  const national = pickNewest(web.filter((item) => item.kind === "国家政务"), 4);
  const encyclopedia = spreadHosts(pickNewest(web.filter((item) => item.kind === "权威百科"), 4), 1, 2);
  const items = unique([...national, ...encyclopedia]);
  if (!items.length && jobs.every((job) => job.status === "rejected")) {
    throw new Error("公网搜索暂时没有返回结果");
  }
  const seeds = [...items].sort((a, b) => {
    const score = (item) => (item.kind === "权威百科" ? 2 : 0) + (/概况|百科/.test(item.title || "") ? 2 : 0);
    return score(b) - score(a);
  }).filter((item) => item.url).slice(0, 2);
  const pages = await Promise.all(seeds.map((item) => readPage(item.url, q)));
  const grounded = items.map((item) => {
    const index = seeds.indexOf(item);
    return index >= 0 && pages[index] ? { ...item, context: pages[index] } : item;
  });
  const fallback = briefAnswer(items.filter((item) => item.kind !== "资料库" && !String(item.id || "").startsWith("KB")));
  let answer = fallback;
  let model = "";
  try {
    const generated = await answerFromSources(q, grounded);
    if (generated?.text) {
      answer = generated.text;
      model = generated.model;
    }
  } catch {
    answer = fallback;
  }
  return {
    keywords: q.split(" ").filter((word) => word.length >= 2).slice(0, 6),
    items,
    answer,
    model,
    sources,
  };
}
