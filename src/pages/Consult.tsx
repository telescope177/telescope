import { useEffect, useState, type ReactNode } from "react";
import { authHeaders } from "../api";
import { Tag } from "../shell";
import { useStore } from "../state";

interface Check {
  name: string;
  resource: string;
  result: string;
  code?: string;
  detail?: string;
}

interface SandboxReport {
  heapLimitMb: number;
  items: Check[];
}

interface SavedSite {
  id: string;
  url: string;
  title: string;
  host: string;
  name?: string;
}

interface DayItem {
  ok: boolean;
  id: string;
  title: string;
  publishedAt: string;
  publisher: string;
  infoKind: string;
  summary: string;
  points: string[];
  url: string;
}

interface ConsultRecord {
  id: string;
  title: string;
  publishedAt: string;
  docNo: string;
  publisher: string;
  summary: string;
  tags: string[];
  infoKind: string;
  finalUrl: string;
  saved?: "created" | "updated";
}

interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  bytes: number;
  sha256: string;
  classification: string;
  reason: string;
  indicators: string[];
  executed: boolean;
  title: string;
  excerpt: string;
  scriptCount: number;
  paragraphs: string[];
  points: string[];
  refine: {
    title: string;
    publishedAt: string;
    docNo: string;
    publisher: string;
    summary: string;
    infoKind: string;
  } | null;
  record: ConsultRecord | null;
  sandbox: SandboxReport;
}


async function readBody(response: Response) {
  const text = await response.text();
  if (!text.trim()) throw new Error("咨询接口未连接");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("咨询接口返回异常");
  }
}

function looksLikeUrl(value: string) {
  const text = value.trim();
  if (!text || /\s/.test(text)) return false;
  if (/^https?:\/\//i.test(text)) return true;
  return /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:].*)?$/i.test(text);
}

function markText(text: string, query: string) {
  const latin = query.match(/[A-Za-z][A-Za-z0-9.+-]{1,}/g) || [];
  const chinese = query
    .replace(/[A-Za-z0-9.+-]+/g, " ")
    .replace(/有哪些|哪些|是什么|什么是|如何|怎么|怎样|为什么|是否|吗|呢|请问/g, " ")
    .split(/[\s,，。？?！!、的了和与在对把]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  const terms = [...new Set([...latin, ...chinese, ...(latin.length || chinese.length ? [] : [query.trim()])])].filter((item) => item.length >= 2);
  if (!text || !terms.length) return text;
  const pattern = new RegExp(terms.sort((a, b) => b.length - a.length).map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) nodes.push(text.slice(last, at));
    nodes.push(<mark className="hl" key={`${at}-${match[0]}`}>{match[0]}</mark>);
    last = at + match[0].length;
  }
  if (!nodes.length) return text;
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function siteDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isSectionHeading(text: string) {
  if (/记者|摄|摄影|图片|新华社|电$/.test(text)) return false;
  if (/^(支柱[一二三四五六七八九十\d]+|[一二三四五六七八九十]+、|（[一二三四五六七八九十]+）|第[一二三四五六七八九十\d]+[章节部分条])/.test(text)) return true;
  return text.length >= 2 && text.length <= 12 && !/[。！？；：:]/.test(text);
}

function ArticleBody({ result, query }: { result: FetchResult; query: string }) {
  const paragraphs = result.paragraphs?.length ? result.paragraphs : [result.refine?.summary || result.reason];
  const headings = paragraphs.filter(isSectionHeading);
  let leadUsed = false;
  return (
    <article className="article">
      <h3>{result.refine?.title || result.title || "未识别标题"}</h3>
      <div className="read-meta">
        {[result.refine?.publisher, result.refine?.publishedAt, result.refine?.docNo].filter(Boolean).join(" · ") || "来源见原文"}
        {result.paragraphs?.length ? ` · 正文 ${result.paragraphs.length} 段` : ""}
      </div>
      {headings.length > 1 ? (
        <nav className="article-nav">
          {headings.map((heading) => (
            <button key={heading} type="button" onClick={() => document.getElementById(`sec-${encodeURIComponent(heading)}`)?.scrollIntoView({ block: "start" })}>{heading}</button>
          ))}
        </nav>
      ) : null}
      <div className="prose">
        {paragraphs.map((paragraph, index) => {
          if (isSectionHeading(paragraph)) return <h4 id={`sec-${encodeURIComponent(paragraph)}`} key={`${index}-${paragraph}`}>{markText(paragraph, query)}</h4>;
          const lead = !leadUsed;
          leadUsed = true;
          return <p className={lead ? "lead" : undefined} key={`${index}-${paragraph.slice(0, 24)}`}>{markText(paragraph, query)}</p>;
        })}
      </div>
      {result.points?.length ? (
        <div className="point-box">
          <b>要点</b>
          <ul className="points">
            {result.points.map((point) => <li key={point}>{point}</li>)}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export function ConsultPage() {
  const { can } = useStore();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"fetch" | "search" | "probe" | "open" | "today" | "yesterday" | null>(null);
  const [opening, setOpening] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<FetchResult | null>(null);
  const [probe, setProbe] = useState<SandboxReport | null>(null);
  const [saved, setSaved] = useState<ConsultRecord[]>([]);
  const [day, setDay] = useState("");
  const [dayItems, setDayItems] = useState<DayItem[]>([]);
  const [sites, setSites] = useState<SavedSite[]>([]);
  const [activeSite, setActiveSite] = useState("");
  const [siteLabel, setSiteLabel] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [siteItems, setSiteItems] = useState<DayItem[] | null>(null);
  const [searchItems, setSearchItems] = useState<DayItem[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchAnswer, setSearchAnswer] = useState("");
  const [searchModel, setSearchModel] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [reader, setReader] = useState(false);

  useEffect(() => {
    fetch("/api/consults")
      .then(readBody)
      .then((body) => { if (body.ok) setSaved(body.items); })
      .catch(() => setSaved([]));
    fetch("/api/consult/sites")
      .then(readBody)
      .then((body) => { if (body.ok) setSites(body.sites || []); })
      .catch(() => setSites([]));
    fetch("/api/consult/yesterday")
      .then(readBody)
      .then((body) => {
        if (!body.ok) return;
        setDay(body.day || "");
        setDayItems(body.items || []);
      })
      .catch(() => setDayItems([]));
  }, [result]);

  useEffect(() => {
    if (!reader) return;
    document.querySelector(".main-scroll")?.scrollTo(0, 0);
  }, [reader, result]);

  async function runDay(which: "today" | "yesterday") {
    setBusy(which);
    setError("");
    try {
      const response = await fetch(which === "today" ? "/api/consult/today" : "/api/consult/yesterday", { method: "POST" });
      const body = await readBody(response);
      if (!response.ok || !body.ok) throw new Error(body.error || (which === "today" ? "当日咨询抓取失败" : "昨日咨询抓取失败"));
      setDay(body.day || "");
      setDayItems(body.items || []);
      setSiteItems(null);
      setSiteLabel("");
      setActiveSite("");
      setSearchItems(null);
      setSearchQuery("");
      setSearchAnswer("");
      setSearchModel("");
      setKeywords([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (which === "today" ? "当日咨询抓取失败" : "昨日咨询抓取失败"));
    } finally {
      setBusy(null);
    }
  }

  async function confirmSave() {
    if (!result?.finalUrl) return;
    setBusy("open");
    setError("");
    try {
      const response = await fetch("/api/consult/save", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ url: result.finalUrl }),
      });
      const body = await readBody(response);
      if (!response.ok || !body.ok) throw new Error(body.error || "入库失败");
      setResult(body);
      setDayItems((items) => items.map((item) => item.url === body.finalUrl ? { ...item, id: body.record?.id || item.id } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "入库失败");
    } finally {
      setBusy(null);
    }
  }

  async function openItem(item: { url: string; title?: string; summary?: string; publisher?: string; publishedAt?: string; id?: string; infoKind?: string }) {
    if (!/^https?:\/\//i.test(item.url)) {
      setOpening("");
      setResult({
        url: "",
        finalUrl: "",
        status: 200,
        contentType: "",
        bytes: 0,
        sha256: "",
        classification: "",
        reason: "",
        indicators: [],
        executed: false,
        title: item.title || "",
        excerpt: item.summary || "",
        scriptCount: 0,
        paragraphs: item.summary ? [item.summary] : [],
        points: [],
        refine: {
          title: item.title || "",
          publishedAt: item.publishedAt || "",
          docNo: item.id || "",
          publisher: item.publisher || "",
          summary: item.summary || "",
          infoKind: item.infoKind || "",
        },
        record: null,
        sandbox: probe ?? { heapLimitMb: 0, items: [] },
      });
      setReader(true);
      return;
    }
    setOpening(item.url);
    setUrl(item.url);
    setBusy("open");
    setError("");
    try {
      const response = await fetch("/api/consult/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: item.url }),
      });
      const body = await readBody(response);
      if (!response.ok || !body.ok) throw new Error(body.error || "详情打开失败");
      setResult(body);
      setProbe(body.sandbox);
      setReader(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "详情打开失败");
    } finally {
      setBusy(null);
      setOpening("");
    }
  }

  async function runFetch(target = url) {
    const address = target.trim();
    if (!address) {
      setError("请填写网址或官网");
      return;
    }
    setBusy("fetch");
    setError("");
    setUrl(address);
    try {
      const response = await fetch("/api/consult/site", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: address }),
      });
      const body = await readBody(response);
      if (!response.ok || !body.ok) throw new Error(body.error || "抓取失败");
      setSites(body.sites || []);
      setActiveSite(body.site?.url || address);
      setSiteLabel(body.label || "");
      setSiteItems(body.items || []);
      setSearchItems(null);
      setSearchQuery("");
      setSearchAnswer("");
      setSearchModel("");
      setKeywords([]);
      if ((body.page?.paragraphs?.length || 0) >= 2) {
        setResult(body.page);
        setProbe(body.page.sandbox);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "抓取失败");
    } finally {
      setBusy(null);
    }
  }

  async function addSavedSite() {
    const address = siteAddress.trim();
    if (!address) {
      setError("请填写网页地址");
      return;
    }
    setError("");
    try {
      const response = await fetch("/api/consult/site/add", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ url: address, name: siteName.trim() }),
      });
      const body = await readBody(response);
      if (!response.ok || !body.ok) throw new Error(body.error || "新增失败");
      setSites(body.sites || []);
      setSiteName("");
      setSiteAddress("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "新增失败");
    }
  }

  async function renameSavedSite(address: string, name: string) {
    setError("");
    try {
      const response = await fetch("/api/consult/site/name", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: address, name }),
      });
      const body = await readBody(response);
      if (!response.ok || !body.ok) throw new Error(body.error || "名称没有保存");
      setSites(body.sites || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "名称没有保存");
    }
  }

  async function removeSavedSite(address: string) {
    setError("");
    try {
      const response = await fetch("/api/consult/site/remove", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ url: address }),
      });
      const body = await readBody(response);
      if (!response.ok || !body.ok) throw new Error(body.error || "移除失败");
      setSites(body.sites || []);
      if (activeSite === address) {
        setActiveSite("");
        setSiteLabel("");
        setSiteItems(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "移除失败");
    }
  }

  async function runSearch(query: string) {
    setBusy("search");
    setError("");
    try {
      const response = await fetch("/api/search/web", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const body = await readBody(response);
      if (!response.ok || !body.ok) throw new Error(body.error || "搜索失败");
      setActiveSite("");
      setSiteLabel("");
      setSearchQuery(query);
      setSearchAnswer(body.answer || "");
      setSearchModel(body.model || "");
      setKeywords(body.sources || []);
      setSearchItems((body.items || []).map((item: { id?: string; title?: string; publishedAt?: string; source?: string; kind?: string; snippet?: string; url?: string }) => ({
        ok: true,
        id: item.id || "",
        title: item.title || "",
        publishedAt: item.publishedAt || "",
        publisher: item.source || "",
        infoKind: item.kind || "",
        summary: item.snippet || "",
        points: [],
        url: item.url || "",
      })));
      setResult(body.answer ? {
        url: "",
        finalUrl: "",
        status: 200,
        contentType: "",
        bytes: 0,
        sha256: "",
        classification: "",
        reason: "",
        indicators: [],
        executed: false,
        title: `公网检索：${query}`,
        excerpt: body.answer,
        scriptCount: 0,
        paragraphs: [body.answer, body.model ? `以上由 DeepSeek（${body.model}）根据左侧公开来源生成。点一条可打开原文。` : "以上是公开网页摘录。点左侧来源可打开原文。"],
        points: [],
        refine: {
          title: `公网检索：${query}`,
          publishedAt: "",
          docNo: "",
          publisher: [body.model ? "DeepSeek" : "", ...(body.sources || [])].filter(Boolean).join("、"),
          summary: body.answer,
          infoKind: body.model ? "DeepSeek" : "公网",
        },
        record: null,
        sandbox: probe ?? { heapLimitMb: 0, items: [] },
      } : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "搜索失败");
    } finally {
      setBusy(null);
    }
  }

  function runBox(target = url) {
    const text = target.trim();
    if (!text) {
      setError("请输入网址，或输入要搜索的内容");
      return;
    }
    if (looksLikeUrl(text)) {
      setError("网址请在右侧新增。抓取请点「抓取当日」或「抓取昨日」。");
      return;
    }
    void runSearch(text);
  }

  async function runProbe() {
    setBusy("probe");
    setError("");
    try {
      const response = await fetch("/api/sandbox/probe", { method: "POST" });
      const body = await readBody(response);
      if (!response.ok || !body.ok) throw new Error(body.error || "沙盒自检失败");
      setProbe(body.sandbox);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "沙盒自检失败");
    } finally {
      setBusy(null);
    }
  }

  const report = result?.sandbox ?? probe;
  const listed = searchItems ?? siteItems ?? dayItems;
  const listTitle = searchItems ? `公网相关「${searchQuery}」` : siteItems ? (siteLabel || (activeSite ? siteDomain(activeSite) : "站内抓取")) : (day ? `${day} 咨询` : "昨日咨询");

  function closeReader() {
    setReader(false);
    document.querySelector(".main-scroll")?.scrollTo(0, 0);
  }

  if (reader && result) {
    return (
      <div className="stack">
        <header className="page-title">
          <div className="reader-head">
            <button className="back-icon" type="button" onClick={closeReader} aria-label="返回上一页" title="返回上一页">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div>
              <h1>{result.refine?.title || result.title || "资料"}</h1>
              <p>{[result.refine?.publisher, result.refine?.publishedAt].filter(Boolean).join(" · ") || "资料页面"}</p>
            </div>
          </div>
          <div className="row">
            {result.refine?.infoKind ? <Tag value={result.refine.infoKind} /> : null}
            {result.finalUrl ? <a className="btn primary" href={result.finalUrl} target="_blank" rel="noreferrer">打开原文</a> : null}
            {result.record?.id ? <span className="tag ok">已入库 {result.record.id}</span> : null}
            {can("consultSave") && result.finalUrl && !result.record?.id ? (
              <button className="btn" type="button" disabled={busy !== null || result.status !== 200} onClick={confirmSave}>确认入库</button>
            ) : null}
          </div>
        </header>
        <section className="card">
          <div className="card-bd stack">
            <ArticleBody result={result} query={searchQuery} />
            {result.finalUrl ? (
              <div className="read-note">
                脚本 {result.scriptCount} 个已剥离，未执行。
                {report ? `沙盒已限制文件、网络和注册表，堆上限 ${report.heapLimitMb} MB。` : ""}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="stack">
      <header className="page-title">
        <div>
          <h1>网络咨询</h1>
          <p>抓取当日或昨日的要闻。输入关键词就在国家政务平台和权威百科中检索，并由 DeepSeek 根据来源生成回答。不执行页面脚本。</p>
        </div>
      </header>
      <section className="card">
        <div className="card-bd stack">
          <div className="toolbar">
            <input className="input" value={url} onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") runBox(); }} placeholder="输入关键词联网搜索" />
            <button className="btn" type="button" disabled={busy !== null} onClick={() => runBox()}>{busy === "search" ? "搜索中" : "搜索"}</button>
            <button className="btn primary" type="button" disabled={busy !== null} onClick={() => void runDay("today")}>{busy === "today" ? "抓取中" : "抓取当日"}</button>
            <button className="btn" type="button" disabled={busy !== null} onClick={() => void runDay("yesterday")}>{busy === "yesterday" ? "抓取中" : "抓取昨日"}</button>
            <button className="btn" type="button" disabled={busy !== null} onClick={runProbe}>{busy === "probe" ? "自检中" : "沙盒自检"}</button>
          </div>
          <div className="site-bar">
            <b>已保存网址</b>
            {sites.length === 0 ? <span className="read-meta">保存后的网址或官网出现在这里，点一下即可在该站内重新抓取。</span> : null}
            {sites.map((site) => (
              <span key={site.url} className={site.url === activeSite ? "site-chip on" : "site-chip"}>
                <button type="button" onClick={() => runFetch(site.url)} disabled={busy !== null} title={site.url}>{site.name || siteDomain(site.url)}</button>
                {can("siteRemove") ? <button type="button" aria-label="移除" onClick={() => removeSavedSite(site.url)}>×</button> : null}
              </span>
            ))}
            <span className="tag info">仅 80 / 443</span>
            <span className="tag">拒绝内网与本机</span>
          </div>
          {error ? <div className="quote">{error}</div> : null}
        </div>
      </section>
      <div className="consult-split">
      <section className="card">
        <div className="card-hd">
          <h2>{listTitle}</h2>
          <span className="row">
            {searchItems ? <button className="btn" type="button" onClick={() => { setSearchItems(null); setSearchQuery(""); setSearchAnswer(""); setSearchModel(""); setKeywords([]); }}>返回列表</button> : null}
            {siteItems && !searchItems ? <button className="btn" type="button" onClick={() => { setSiteItems(null); setActiveSite(""); setSiteLabel(""); }}>昨日列表</button> : null}
            <span className="tag">{listed.length} 条</span>
          </span>
        </div>
        <div className="card-bd">
          {searchItems ? <div className="row">{searchModel ? <span className="tag purple">DeepSeek</span> : null}{keywords.map((word) => <span className="tag info" key={word}>{word}</span>)}</div> : null}
          {searchAnswer ? <div className="quote">{markText(searchAnswer, searchQuery)}</div> : null}
          {listed.length === 0 ? <div className="quote">{searchItems ? "公网上没有找到相关内容。可以换一个关键词。" : siteItems ? "这个页面里没有发现可打开的正文链接。" : "点「抓取当日」或「抓取昨日」。"}</div> : null}
          <div className="consult-list">
            {listed.map((item, index) => (
              <div key={`${item.id}-${item.url}-${index}`} className={((item.url && url === item.url) || (result?.refine?.title === item.title && !item.url)) && result ? "consult-item on" : "consult-item"}>
                <button className="consult-open" type="button" onClick={() => openItem(item)}>
                  <span className="consult-index">{index + 1}</span>
                  <span>
                    <span className="row">
                      {item.publishedAt ? <span className="tag info">{item.publishedAt}</span> : null}
                      {item.infoKind ? <Tag value={item.infoKind} /> : null}
                      {item.id ? <span className="tag">{item.id}</span> : null}
                      {opening === item.url ? <span className="tag amber">打开中</span> : null}
                    </span>
                    <span className="consult-title">{markText(item.title, searchQuery)}</span>
                    {item.publisher ? <span className="read-meta">{item.publisher}</span> : null}
                    {item.summary ? <span className="consult-snippet">{markText(item.summary, searchQuery)}</span> : null}
                  </span>
                </button>
                {/^https?:\/\//i.test(item.url) ? <a className="consult-source" href={item.url} target="_blank" rel="noreferrer">原文</a> : null}
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="consult-side">
      <section className="card">
        <div className="card-hd"><h2>已保存网址</h2><span className="tag">{sites.length} 个</span></div>
        <div className="card-bd site-box">
          <div className="site-add">
            <input className="input" value={siteName} onChange={(event) => setSiteName(event.target.value)} placeholder="网页名称" maxLength={40} />
            <input className="input" value={siteAddress} onChange={(event) => setSiteAddress(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addSavedSite(); }} placeholder="网页地址，如 https://www.gov.cn/" />
            <button className="btn primary" type="button" onClick={() => void addSavedSite()}>新增</button>
          </div>
          {sites.length === 0 ? <div className="quote">填写名称和地址后点「新增」。点一条已保存网址会抓取该页。</div> : null}
          {sites.map((site) => (
            <div key={site.url} className={site.url === activeSite ? "site-item on" : "site-item"}>
              <input className="input" defaultValue={site.name || ""} key={`${site.url}-${site.name || ""}`} placeholder="备注名称" maxLength={40} onBlur={(event) => { if (event.target.value.trim() !== (site.name || "")) void renameSavedSite(site.url, event.target.value.trim()); }} />
              <button type="button" onClick={() => runFetch(site.url)} disabled={busy !== null}>
                <b>{site.name || siteDomain(site.url)}</b>
                <span>{site.url}</span>
              </button>
              {can("siteRemove") ? <button className="btn" type="button" onClick={() => removeSavedSite(site.url)}>删除</button> : null}
            </div>
          ))}
        </div>
      </section>
      <section className="card consult-pane" id="consult-detail">
        <div className="card-hd">
          <h2>咨询详情</h2>
          <span className="row">
            {result?.refine?.infoKind ? <Tag value={result.refine.infoKind} /> : null}
            {result?.finalUrl ? <a className="btn primary" href={result.finalUrl} target="_blank" rel="noreferrer">打开原文</a> : null}
            {result?.record?.id ? <span className="tag ok">已入库 {result.record.id}</span> : null}
            {can("consultSave") && result?.finalUrl && !result.record?.id ? (
              <button className="btn" type="button" disabled={busy !== null || result.status !== 200} onClick={confirmSave}>确认入库</button>
            ) : null}
          </span>
        </div>
        <div className="card-bd stack">
          <div className="quote">点一条资料会打开它自己的页面。也可从上方已保存网址重新抓取。</div>
        </div>
      </section>
      </div>
      </div>
      <section className="card">
        <div className="card-hd"><h2>已入库咨询</h2><span className="tag">{saved.length} 条</span></div>
        <div className="card-bd">
          {saved.length === 0 ? <div className="quote">确认入库后记在这里。同一网址再次确认会更新原记录。</div> : null}
          <div className="saved-list">
            {saved.map((item) => (
              <button key={item.id} className="saved-item" type="button" onClick={() => openItem({ url: item.finalUrl })}>
                <b>{item.id}</b>
                <Tag value={item.infoKind} />
                <span>{item.title}</span>
                <em>{[item.publisher, item.publishedAt].filter(Boolean).join(" · ")}</em>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
