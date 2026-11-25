import { useState } from "react";
import { exactSearch, fuzzySearch, type KnowledgeDoc } from "../domain";
import { useLiveBasis } from "../live-basis";
import { useStore } from "../state";
import { Tag } from "../shell";

const EXACT = "协同〔2026〕07号";
const FUZZY = "便民服务什么时候提数据";
const KEYWORD = "便民服务 报送";

interface AiHit {
  id: string;
  title: string;
  docNo: string;
  source: string;
  publishedAt: string;
  kind: string;
  status: string;
  url: string;
  score: number;
  keywords: string[];
  snippet: string;
}

export function SearchPage() {
  const { patch } = useStore();
  const docs = useLiveBasis().knowledge;
  const [mode, setMode] = useState<"exact" | "fuzzy" | "keyword">("exact");
  const [query, setQuery] = useState(EXACT);
  const [hits, setHits] = useState<KnowledgeDoc[]>([]);
  const [related, setRelated] = useState<KnowledgeDoc[]>([]);
  const [reader, setReader] = useState<KnowledgeDoc | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [aiHits, setAiHits] = useState<AiHit[]>([]);
  const [aiWords, setAiWords] = useState<string[]>([]);
  const [aiReader, setAiReader] = useState<AiHit | null>(null);
  const [aiError, setAiError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  async function runKeyword(next = query) {
    const q = next.trim();
    if (!q) return;
    setAiBusy(true);
    setAiError("");
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "检索失败");
      const items = (body.items || []) as AiHit[];
      setAiHits(items);
      setAiWords(body.keywords || []);
      setAiReader(items[0] ?? null);
      const doc = items[0] ? docs.find((item) => item.id === items[0].id) ?? null : null;
      setReader(doc);
    } catch (cause) {
      setAiHits([]);
      setAiReader(null);
      setAiError(cause instanceof Error ? cause.message : "检索失败");
    } finally {
      setAiBusy(false);
    }
  }

  function run(next = query, nextMode = mode) {
    if (nextMode === "keyword") {
      void runKeyword(next);
      return;
    }
    if (nextMode === "exact") {
      const found = exactSearch(next, docs);
      setHits(found);
      setRelated([]);
      setReader(found[0] ?? null);
      if (found[0]?.id === "KB-003") patch({ exactDone: true });
    } else {
      const found = fuzzySearch(next, docs);
      setHits(found.recommend);
      setRelated(found.related);
      setReader(found.recommend[0] ?? null);
      if (found.recommend.some((item) => item.id === "KB-003") && found.recommend.some((item) => item.id === "KB-004")) {
        patch({ fuzzyDone: true });
      }
    }
  }

  function jump() {
    setFlash(2);
    document.getElementById("article-2")?.scrollIntoView({ block: "center" });
  }

  return (
    <div className="stack">
      <header className="page-title">
        <div>
          <h1>依据检索</h1>
          <p>先选问法，再检索。左边是命中列表，右边打开同一篇原文。</p>
        </div>
      </header>
      <section className="card">
        <div className="card-bd stack">
          <div className="toolbar">
            <div className="seg">
              <button className={mode === "exact" ? "on" : ""} type="button" onClick={() => { setMode("exact"); setQuery(EXACT); }}>完整文号</button>
              <button className={mode === "fuzzy" ? "on" : ""} type="button" onClick={() => { setMode("fuzzy"); setQuery(FUZZY); }}>主题近义</button>
              <button className={mode === "keyword" ? "on" : ""} type="button" onClick={() => { setMode("keyword"); setQuery(KEYWORD); }}>关键词</button>
            </div>
            <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") run(); }} />
            <button className="btn primary" type="button" disabled={aiBusy} onClick={() => run()}>{aiBusy ? "检索中" : "检索"}</button>
          </div>
          <div className="row">
            <button className="btn" type="button" onClick={() => { setMode("exact"); setQuery(EXACT); run(EXACT, "exact"); }}>{EXACT}</button>
            <button className="btn" type="button" onClick={() => { setMode("fuzzy"); setQuery(FUZZY); run(FUZZY, "fuzzy"); }}>{FUZZY}</button>
            <button className="btn" type="button" onClick={() => { setMode("keyword"); setQuery(KEYWORD); run(KEYWORD, "keyword"); }}>{KEYWORD}</button>
            {mode === "exact" && hits[0]?.id === "KB-003" ? <span className="tag ok">首条 · KB-003</span> : null}
            {mode === "fuzzy" && hits.length > 0 ? <span className="tag info">推荐 KB-003、KB-004</span> : null}
            {mode === "keyword" && aiWords.length > 0 ? <span className="tag info">关键词 {aiWords.slice(0, 4).join("、")}</span> : null}
          </div>
        </div>
      </section>
      <div className="split">
        <section className="card">
          <div className="card-hd"><h2>检索结果</h2><span className="tag">{mode === "keyword" ? aiHits.length : hits.length + related.length} 条</span></div>
          <div className="card-bd stack">
            {aiError ? <div className="quote">{aiError}</div> : null}
            <div className="stack">
              {mode === "keyword" ? aiHits.map((doc) => (
                <button key={doc.id} className="quote" type="button" style={{ textAlign: "left" }} onClick={() => { setAiReader(doc); setReader(docs.find((item) => item.id === doc.id) ?? null); }}>
                  <div className="row">
                    <b>{doc.id}</b>
                    <Tag value={doc.kind} />
                    <span className="tag">相关 {doc.score}</span>
                  </div>
                  <div>{doc.title}</div>
                  <div style={{ color: "#475569" }}>{doc.snippet}</div>
                </button>
              )) : null}
              {mode !== "keyword" ? hits.map((doc) => (
                <Result key={doc.id} doc={doc} mode={mode === "fuzzy" ? "fuzzy" : "exact"} recommend onOpen={() => setReader(doc)} />
              )) : null}
              {mode !== "keyword" ? related.map((doc) => (
                <Result key={doc.id} doc={doc} mode="fuzzy" recommend={false} onOpen={() => setReader(doc)} />
              )) : null}
              {mode !== "keyword" && hits.length === 0 ? <div className="quote">检索后，命中文件列在这里，点开后在右侧读条款。</div> : null}
              {mode === "keyword" && !aiBusy && aiHits.length === 0 ? <div className="quote">输入关键词后检索。结果来自知识库和已入库咨询。</div> : null}
            </div>
          </div>
        </section>
        <section className="card">
          <div className="card-hd">
            <h2>{reader ? reader.title : aiReader ? aiReader.title : "原文阅读器"}</h2>
            {reader ? <Tag value={reader.status} /> : aiReader ? <Tag value={aiReader.kind} /> : null}
          </div>
          <div className="card-bd stack">
            {reader ? (
              <>
                <div>发文字号：{reader.docNo}</div>
                <div>来源：{reader.source} · 发布日期：{reader.publishedAt} · 版本：{reader.versionLabel}</div>
                <div className="row">
                  {reader.articles.map((article) => (
                    <button key={article.no} className="btn" type="button" onClick={() => { setFlash(article.no); document.getElementById(`article-${article.no}`)?.scrollIntoView({ block: "center" }); }}>
                      第 {article.no} 条
                    </button>
                  ))}
                  {reader.id === "KB-003" ? <button className="btn primary" type="button" onClick={jump}>跳转到第 2 条</button> : null}
                </div>
                {reader.articles.map((article) => (
                  <article key={article.no} id={`article-${article.no}`} className={flash === article.no ? "quote on" : "quote"}>
                    <b>第 {article.no} 条</b>
                    <div>{article.text}</div>
                  </article>
                ))}
              </>
            ) : aiReader ? (
              <>
                <div>{aiReader.docNo || aiReader.kind}</div>
                <div>来源：{aiReader.source || "未注明"} · {aiReader.publishedAt || "日期未注明"}</div>
                <div className="quote">{aiReader.snippet}</div>
                {aiReader.url ? <a className="btn primary" href={aiReader.url} target="_blank" rel="noreferrer">打开原文</a> : null}
              </>
            ) : <div className="quote">检索后在这里查看来源、日期、版本和条款。</div>}
          </div>
        </section>
      </div>
      <div className="tag muted">知识库 {docs.length} 篇在库，KB-008 在资料归集归档后出现。</div>
    </div>
  );
}

function Result({ doc, recommend, mode, onOpen }: { doc: KnowledgeDoc; recommend: boolean; mode: "exact" | "fuzzy"; onOpen: () => void }) {
  return (
    <button className="quote" type="button" onClick={onOpen} style={{ textAlign: "left" }}>
      <div className="row">
        <b>{doc.id}</b>
        <Tag value={doc.status} />
        {mode === "fuzzy" ? <span className="tag">{recommend ? "推荐" : "替代关系"}</span> : <span className="tag">文号命中</span>}
      </div>
      <div>{doc.title}</div>
      <div>{doc.docNo}</div>
      {mode === "fuzzy" ? (
        <div style={{ color: "#475569" }}>
          {doc.id === "KB-003" ? "主题相近 · 上下文：第 2 条答复什么时候报送" : null}
          {doc.id === "KB-004" ? "主题相近 · 已被 KB-003 替代" : null}
          {doc.id === "KB-005" ? "替代关系：被现行文件 KB-003 替代" : null}
        </div>
      ) : (
        <div style={{ color: "#475569" }}>来源 {doc.source} · {doc.publishedAt} · {doc.versionLabel}</div>
      )}
    </button>
  );
}
