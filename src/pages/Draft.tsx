import { useRef, useState } from "react";
import { inspect } from "../domain";
import { useLiveBasis } from "../live-basis";
import { DataEditor } from "../editor/DataEditor";
import { DocEditor, type DocEditorHandle } from "../editor/DocEditor";
import { type EditMode, readUpload } from "../editor/open";
import { SheetEditor } from "../editor/SheetEditor";
import { DraftPaper } from "../paper";
import { useStore } from "../state";

interface Opinion {
  id: string;
  kind: string;
  title: string;
  detail: string;
  suggestion: string | null;
  quote: string;
  next: string;
}

function reviewUpload(text: string): Opinion[] {
  const found: Opinion[] = [];
  if (text.includes("协凋")) {
    found.push({ id: "U-01", kind: "文字纠错", title: "疑似错字「协凋」", detail: "正文出现「协凋」，不是规范用字。", suggestion: "改为「协调」", quote: "协凋", next: "协调" });
  }
  if (text.includes("进一部")) {
    found.push({ id: "U-06", kind: "文字纠错", title: "疑似错字「进一部」", detail: "正文出现「进一部」，规范用字是「进一步」。", suggestion: "改为「进一步」", quote: "进一部", next: "进一步" });
  }
  const slash = text.match(/\d{4}\/\d{1,2}\/\d{1,2}/);
  if (slash) {
    const [year, month, day] = slash[0].split("/");
    found.push({ id: "U-07", kind: "格式校验", title: "成文日期格式需统一", detail: "落款日期使用了斜线。公文日期写为年月日。", suggestion: `改为 ${year}年${month}月${day}日`, quote: slash[0], next: `${year}年${month}月${day}日` });
  }
  const tail = text.slice(-80);
  if (!/成文日期/.test(text) && !/\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/.test(tail) && !slash) {
    found.push({ id: "U-02", kind: "格式校验", title: "未检出成文日期", detail: "落款附近没有成文日期。成文日期是本次检查的必要要素。", suggestion: "在落款补上成文日期", quote: "", next: "2026年11月20日" });
  }
  const oldNo = text.match(/协同[〔\[]\s*2025\s*[〕\]]\s*09\s*号/);
  if (oldNo) {
    found.push({ id: "U-03", kind: "合规预审", title: "引用旧版", detail: "文中引用协同〔2025〕09号。该文已被现行文件废止。", suggestion: "改引协同〔2026〕07号", quote: oldNo[0], next: "协同〔2026〕07号" });
  }
  if (text.includes("全市各部门")) {
    found.push({ id: "U-04", kind: "合规预审", title: "报送范围过宽", detail: "文中写有「全市各部门」。现行适用范围是本级各街道便民服务中心。", suggestion: "收窄为本级各街道便民服务中心", quote: "全市各部门", next: "本级各街道便民服务中心" });
  }
  if (text.includes("各社区居委会")) {
    found.push({ id: "U-08", kind: "合规预审", title: "报送对象超出正文范围", detail: "正文写明报送对象是街道便民服务中心，落款又写了各社区居委会。", suggestion: "删除各社区居委会", quote: "、各社区居委会", next: "" });
  }
  const limit = text.match(/每月\s*15\s*日前/);
  if (limit) {
    found.push({ id: "U-05", kind: "合规预审", title: "报送时限沿用旧口径", detail: "文中写每月 15 日前。现行条款是每月 5 日前。", suggestion: "改为每月 5 日前", quote: limit[0], next: "每月 5 日前" });
  }
  return found;
}

export function DraftPage() {
  const { state, patch, toast } = useStore();
  const { knowledge, basis } = useLiveBasis();
  const [version, setVersion] = useState<"v1" | "v2">("v1");
  const [active, setActive] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [clauseId, setClauseId] = useState("KB-003");
  const [seeOriginal, setSeeOriginal] = useState(true);
  const [fileName, setFileName] = useState("");
  const [kindLabel, setKindLabel] = useState("");
  const [mode, setMode] = useState<EditMode>("text");
  const [docHtml, setDocHtml] = useState("");
  const [grid, setGrid] = useState<string[][]>([[""]]);
  const [fields, setFields] = useState<{ key: string; value: string }[]>([]);
  const [docKey, setDocKey] = useState(0);
  const [opinions, setOpinions] = useState<Opinion[] | null>(null);
  const [stale, setStale] = useState(false);
  const editorRef = useRef<DocEditorHandle>(null);
  const [pickedUpload, setPickedUpload] = useState<string | null>(null);
  const [lane, setLane] = useState<"upload" | "stock">("upload");
  const showFixed = version === "v1" && state.typoAccepted && !seeOriginal;
  const list = state.draftChecked ? inspect(version) : [];
  const issue = list.find((item) => item.id === picked);
  const clauseDoc = clauseId;
  const policy = knowledge.find((item) => item.id === clauseDoc);

  function check() {
    patch({ draftChecked: true });
    setVersion("v1");
    setPicked("F-01");
    setActive(["typo"]);
  }

  function loadDocument(name: string, opened: Awaited<ReturnType<typeof readUpload>>) {
    setFileName(name);
    setKindLabel(opened.label);
    setMode(opened.mode);
    setDocHtml(opened.html || "<p><br></p>");
    setGrid(opened.grid);
    setFields(opened.fields);
    setDocKey((value) => value + 1);
    setPickedUpload(null);
    setStale(false);
    setOpinions(opened.text.trim() ? reviewUpload(opened.text) : []);
  }

  async function onUpload(file: File) {
    try {
      loadDocument(file.name, await readUpload(file));
    } catch (error) {
      toast(error instanceof Error ? error.message : "无法打开这份文件");
    }
  }

  function rerun() {
    const text = editorRef.current?.plain() ?? "";
    setStale(false);
    setOpinions(reviewUpload(text));
    setPickedUpload(null);
  }

  function accept(item: Opinion) {
    const done = editorRef.current?.replaceFirst(item.quote, item.next) ?? false;
    if (done) setStale(true);
  }

  function focus(id: string, anchors: string[]) {
    setPicked(id);
    setActive(anchors);
    if (id === "F-03" || id === "F-04") setClauseId("KB-003");
    document.querySelector(`[data-anchor="${anchors[0]}"]`)?.scrollIntoView({ block: "center" });
  }

  return (
    <div className="stack">
      <header className="page-title">
        <div>
          <h1>文稿预审</h1>
          <p>{lane === "upload" ? "按文件类型打开对应的修改方式：Word、纯文本、表格或数据。" : "检查在库文稿 DRAFT-01。v1 出 4 条，v2 为 0 条。"}</p>
        </div>
        <div className="seg">
          <button className={lane === "upload" ? "on" : ""} type="button" onClick={() => setLane("upload")}>上传审核</button>
          <button className={lane === "stock" ? "on" : ""} type="button" onClick={() => setLane("stock")}>在库文稿</button>
        </div>
      </header>
      {lane === "stock" ? (
        <div className="row">
          <button className={version === "v1" ? "btn primary" : "btn"} type="button" onClick={() => { setVersion("v1"); setPicked(null); setActive([]); setSeeOriginal(true); }}>v1</button>
          <button className={version === "v2" ? "btn primary" : "btn"} type="button" onClick={() => { setVersion("v2"); setPicked(null); setActive([]); setSeeOriginal(true); }}>v2</button>
          <button className="btn primary" type="button" onClick={check}>检查文稿</button>
        </div>
      ) : null}
      {lane === "upload" ? (
        <div className="row">
          <label className="btn primary">
            打开文稿
            <input type="file" accept=".txt,.md,.csv,.json,.docx,.xlsx,text/plain,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onUpload(file); }} />
          </label>
          <button className="btn" type="button" onClick={() => void onUpload(new File([
            "为进一步做好街道便民服务协凋工作，现就 2026 年 10 月运行情况报送如下。根据《关于规范街道便民服务数据报送工作的通知》（协同〔2025〕09号）要求，请全市各部门及社会单位于每月 15 日前汇总报送相关数据。",
          ], "DRAFT-01.txt", { type: "text/plain" }))}>解析示例文稿</button>
          {fileName ? <><span className="tag info">{kindLabel}</span><span className="tag">{fileName}</span></> : <span className="read-meta">支持 docx、txt、md、xlsx、csv、json。打开后按类型匹配修改方式。</span>}
        </div>
      ) : null}
      {lane === "upload" && opinions ? (
        <div className="split">
          {mode === "sheet" ? (
            <SheetEditor
              key={docKey}
              ref={editorRef}
              rows={grid}
              fileName={fileName}
              quote={opinions.find((item) => item.id === pickedUpload)?.quote ?? ""}
              stale={stale}
              onEdit={() => { if (opinions) setStale(true); }}
            />
          ) : mode === "data" ? (
            <DataEditor
              key={docKey}
              ref={editorRef}
              fields={fields}
              fileName={fileName}
              quote={opinions.find((item) => item.id === pickedUpload)?.quote ?? ""}
              stale={stale}
              onEdit={() => { if (opinions) setStale(true); }}
            />
          ) : (
            <DocEditor
              key={docKey}
              ref={editorRef}
              mode={mode === "word" ? "word" : "text"}
              fileName={fileName}
              html={docHtml}
              quote={opinions.find((item) => item.id === pickedUpload)?.quote ?? ""}
              stale={stale}
              onPlain={() => undefined}
              onEdit={() => { if (opinions) setStale(true); }}
            />
          )}
          <section className="card">
            <div className="card-hd">
              <h2>修改意见</h2>
              <span className="row">
                <span className="tag">{opinions.length} 条</span>
                <button className="btn" type="button" onClick={rerun}>重新预审</button>
              </span>
            </div>
            <div className="card-bd stack">
              {opinions.length === 0 ? <div className="quote">未发现错字、缺成文日期、旧文号或报送范围问题。</div> : null}
              {["文字纠错", "格式校验", "合规预审"].map((kind) => {
                const group = opinions.filter((item) => item.kind === kind);
                if (!group.length) return null;
                return (
                  <div key={kind} className="stack">
                    <b>{kind}</b>
                    {group.map((item) => (
                      <div key={item.id} className={`issue${pickedUpload === item.id ? " on" : ""}`}>
                        <button className="issue-open" type="button" onClick={() => setPickedUpload(item.id)}>
                          <b>{item.title}</b>
                          <span>{item.detail}</span>
                          {item.suggestion ? <div className="tag info">{item.suggestion}</div> : null}
                        </button>
                        <button className="btn" type="button" onClick={() => { setPickedUpload(item.id); accept(item); }}>采纳</button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
      {lane === "stock" ? <div className="split even">
        <DraftPaper
          version={version}
          active={active}
          typoFixed={showFixed}
          caption={version === "v2" ? "修订快照，不继承 v1" : showFixed ? "修改稿" : "原文"}
        />
        <section className="stack">
          <div className="card">
            <div className="card-hd">
              <h2>{version === "v2" ? "v2 结果" : "一次检查"}</h2>
              <span className="tag">{list.length} 条</span>
            </div>
            <div className="card-bd stack">
              {!state.draftChecked ? <div className="quote">先点「检查文稿」。文字、格式、合规出在同一张单上。</div> : null}
              {state.draftChecked && list.length === 0 ? <div className="quote">v2 是修订快照，历史结果 0 条，不带上 v1 的 4 条。</div> : null}
              {["文字纠错", "格式校验", "合规预审"].map((kind) => {
                const group = list.filter((item) => item.kind === kind);
                if (!group.length) return null;
                return (
                  <div key={kind} className="stack">
                    <b>{kind}</b>
                    {group.map((item) => (
                      <button key={item.id} className={`issue${picked === item.id ? " on" : ""}`} type="button" onClick={() => focus(item.id, item.anchors)}>
                        <b>{item.id} {item.title}</b>
                        <span>{item.detail}</span>
                        {item.suggestion ? <div className="tag info">{item.suggestion}</div> : null}
                      </button>
                    ))}
                  </div>
                );
              })}
              {picked === "F-01" && version === "v1" && !state.typoAccepted ? (
                <button className="btn primary" type="button" onClick={() => { patch({ typoAccepted: true }); setSeeOriginal(false); setActive(["typo"]); }}>采纳</button>
              ) : null}
              {state.typoAccepted && version === "v1" ? (
                <>
                  <div className="row">
                    <button className={seeOriginal ? "btn primary" : "btn"} type="button" onClick={() => { setSeeOriginal(true); setActive(["typo"]); }}>查看原文</button>
                    <button className={seeOriginal ? "btn" : "btn primary"} type="button" onClick={() => { setSeeOriginal(false); setActive(["typo"]); }}>查看修改稿</button>
                    <button className="btn" type="button" onClick={() => { patch({ typoAccepted: false }); setSeeOriginal(true); setActive(["typo"]); }}>回到初始状态</button>
                  </div>
                  <div className="tag ok">{seeOriginal ? "正在看原文「协凋」。修改稿是「协调」，送审快照仍是原文。" : "正在看修改稿「协调」。原文和送审快照仍是「协凋」。"}</div>
                </>
              ) : null}
            </div>
          </div>
          {issue?.clause && policy ? (
            <div className="card">
              <div className="card-hd"><h2>依据：前后稿对照</h2></div>
              <div className="card-bd stack">
                <table>
                  <thead><tr><th>项目</th><th>前稿 KB-005</th><th>现行 KB-003</th><th>当前稿</th></tr></thead>
                  <tbody>
                    {basis.map((row) => (
                      <tr key={row.item}><td>{row.item}</td><td>{row.previous}</td><td>{row.current}</td><td>{row.draftV1}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div className="row">
                  {["KB-001", "KB-002", "KB-003", "KB-005"].map((id) => (
                    <button key={id} className={clauseId === id ? "btn primary" : "btn"} type="button" onClick={() => setClauseId(id)}>{knowledge.find((item) => item.id === id)?.level} {id}</button>
                  ))}
                </div>
                <div className="quote">
                  <b>{policy.id} 第 {issue.clause.articleNo} 条</b>
                  <div>{policy.articles.find((article) => article.no === (clauseId === issue.clause?.docId ? issue.clause.articleNo : 2))?.text ?? policy.articles[0]?.text}</div>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div> : null}
    </div>
  );
}

