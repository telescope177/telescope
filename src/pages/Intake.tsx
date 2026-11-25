import { useEffect, useMemo, useRef, useState } from "react";
import { authHeaders } from "../api";
import { jobs, libraryDocs, uploads, type KnowledgeDoc } from "../domain";
import { useStore } from "../state";
import { Tag } from "../shell";

export function IntakePage() {
  const { state, patch, toast, can } = useStore();
  const [running, setRunning] = useState(false);
  const [minutes, setMinutes] = useState(() => {
    const saved = Number(localStorage.getItem("gov-collect-interval"));
    return Number.isFinite(saved) && saved >= 1 && saved <= 1440 ? saved : 30;
  });
  const [clock, setClock] = useState(() => readClock());
  const [intervalAt, setIntervalAt] = useState(() => Date.now() + 30 * 60 * 1000);
  const [clockAt, setClockAt] = useState(() => nextDaily(readClock()));
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [source, setSource] = useState("全部");
  const [level, setLevel] = useState("全部");
  const [theme, setTheme] = useState("全部");
  const [infoKind, setInfoKind] = useState("全部");
  const [result, setResult] = useState("全部");
  const [activeUp, setActiveUp] = useState<"UP-01" | "UP-02">("UP-01");
  const [anchor, setAnchor] = useState("");
  const [category, setCategory] = useState("全部");
  const [ledger, setLedger] = useState("全部");
  const [docLevel, setDocLevel] = useState("全部");
  const [status, setStatus] = useState("全部");
  const [focus, setFocus] = useState<"KB-003" | "KB-005">("KB-003");
  const [step, setStep] = useState<"collect" | "extract" | "library">("collect");

  const visibleJobs = jobs.filter((job) => {
    if (!state.collectRan) return false;
    if (source !== "全部" && job.source !== source) return false;
    if (level !== "全部" && job.level !== level) return false;
    if (theme !== "全部" && job.theme !== theme) return false;
    if (infoKind !== "全部" && job.infoKind !== infoKind) return false;
    if (result !== "全部" && job.result !== result) return false;
    return true;
  }).sort((a, b) => b.at.localeCompare(a.at));
  const sample = uploads.find((item) => item.id === activeUp)!;
  const docs = useMemo(() => {
    return libraryDocs(state.archived).filter((doc) => {
      if (category !== "全部" && doc.category !== category) return false;
      if (ledger === "台账" && !doc.ledger) return false;
      if (ledger === "非台账" && doc.ledger) return false;
      if (docLevel !== "全部" && doc.level !== docLevel) return false;
      if (status !== "全部" && doc.status !== status) return false;
      return true;
    });
  }, [state.archived, category, ledger, docLevel, status]);
  const current = libraryDocs(state.archived).find((doc) => doc.id === "KB-003")!;
  const previous = libraryDocs(false).find((doc) => doc.id === "KB-005")!;
  const shown = focus === "KB-003" ? current : previous;

  const collectRef = useRef<() => void>(() => {});

  function collect() {
    setRunning(true);
    window.setTimeout(() => {
      setRunning(false);
      patch({ collectRan: true });
      const created = jobs.filter((job) => job.result === "新入库").length;
      const skipped = jobs.filter((job) => job.result === "重复跳过").length;
      const failed = jobs.filter((job) => job.result === "失败待重试").length;
      toast(`采集完成：新入库 ${created}，重复跳过 ${skipped}，失败待重试 ${failed}`);
      void fetch("/api/audit", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ event: "资料归集", detail: `新入库 ${created}` }) }).catch(() => undefined);
      setIntervalAt(Date.now() + minutes * 60 * 1000);
      setClockAt(nextDaily(clock));
    }, 700);
  }

  collectRef.current = collect;

  useEffect(() => {
    const span = Math.min(1440, Math.max(1, minutes)) * 60 * 1000;
    localStorage.setItem("gov-collect-interval", String(Math.min(1440, Math.max(1, minutes))));
    setIntervalAt(Date.now() + span);
    const timer = window.setInterval(() => collectRef.current(), span);
    return () => window.clearInterval(timer);
  }, [minutes]);

  useEffect(() => {
    const label = clockLabel(clock);
    localStorage.setItem("gov-collect-clock", label);
    let timer = 0;
    const arm = () => {
      const at = nextDaily(clock);
      setClockAt(at);
      timer = window.setTimeout(() => {
        collectRef.current();
        arm();
      }, Math.max(1000, at - Date.now()));
    };
    arm();
    return () => window.clearTimeout(timer);
  }, [clock]);

  return (
    <div className="stack">
      <header className="page-title">
        <div>
          <h1>资料归集</h1>
          <p>{step === "collect" ? "采集当天资讯并标出资讯类别。结果是新入库、重复跳过、失败待重试。" : step === "extract" ? "从通知和台账抽出指标。296、234 交给办件分析，UP-02 文号为待核。" : "KB-003 保持现行。落后的 KB-005 归入内部稿 KB-008。"}</p>
        </div>
      </header>
      <div className="steps">
        <button type="button" className={step === "collect" ? "on" : ""} onClick={() => setStep("collect")}>
          <b>1 采集</b><small>{state.collectRan ? "已完成 · 按最新时间" : `每 ${minutes} 分钟`}</small>
        </button>
        <button type="button" className={step === "extract" ? "on" : ""} onClick={() => setStep("extract")}>
          <b>2 抽取</b><small>{state.extracted["UP-01"] && state.extracted["UP-02"] ? "已完成 · 2 条指标 + 待核" : "通知 UP-01、台账 UP-02"}</small>
        </button>
        <button type="button" className={step === "library" ? "on" : ""} onClick={() => setStep("library")}>
          <b>3 归档</b><small>{state.archived ? "已完成 · KB-008" : "现行 KB-003，落后 KB-005"}</small>
        </button>
      </div>

      {step === "collect" ? (
      <section className="card">
        <div className="card-hd">
          <h2>今日归集</h2>
          <div className="row">
            <label className="field">间隔（分钟）
              <input
                type="number"
                min={1}
                max={1440}
                value={minutes}
                onChange={(event) => setMinutes(Math.min(1440, Math.max(1, Number(event.target.value) || 1)))}
              />
            </label>
            <label className="field">每天
              <input type="time" value={clockLabel(clock)} onChange={(event) => setClock(parseClock(event.target.value))} />
            </label>
            <span className="tag info">每 {minutes} 分钟</span>
            <span className="tag">每天 {clockLabel(clock)}</span>
            <span className="tag">下次 {new Date(Math.min(intervalAt, clockAt)).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
            {can("intake") ? <button className="btn primary" type="button" disabled={running} onClick={collect}>
              {running ? "归集中…" : "立即抓取"}
            </button> : null}
          </div>
        </div>
        <div className="card-bd stack">
          <div className="row">
            <Select label="来源" value={source} onChange={setSource} options={["全部", "中国政府网", "国家发展和改革委员会", "国家统计局", "国务院发展研究中心", "上海市人民政府", "浙江省人民政府", "全国政务服务会议", "国务院客户端"]} />
            <Select label="层级" value={level} onChange={setLevel} options={["全部", "中央", "省级", "市级", "本级"]} />
            <Select label="资讯类别" value={infoKind} onChange={setInfoKind} options={["全部", "国家政策", "省市政策", "会议精神", "专项工作", "政策解读", "专家建议", "产业分析", "数据解读"]} />
            <Select label="主题" value={theme} onChange={setTheme} options={["全部", "便民服务", "数据共享", "报送时限", "城市发展", "经济建设"]} />
            <Select label="结果" value={result} onChange={setResult} options={["全部", "新入库", "重复跳过", "失败待重试"]} />
          </div>
          {!state.collectRan ? <div className="quote">尚未抓取。到设定间隔会自动抓取，也可点「立即抓取」。结果按最新时间排列，涵盖国家部委、省市政策、会议精神、专项工作，以及专家建议、产业分析和数据解读。</div> : null}
          {visibleJobs.map((job) => (
            <article key={job.id} className="quote">
              <div className="row">
                <b>{job.id}</b>
                <Tag value={job.result} />
                <span className="tag info">资讯类别 · {job.infoKind}</span>
                <span className="tag">{job.at}</span>
                <span>{job.source}</span>
                <span>{job.level}</span>
                <span>{job.theme}</span>
              </div>
              <div>{job.title}</div>
              <div style={{ color: "#475569" }}>{job.reason}</div>
              {job.article ? (
                <button className="btn" type="button" onClick={() => setOpenJob(openJob === job.id ? null : job.id)}>
                  查看原文
                </button>
              ) : null}
              {job.result === "失败待重试" ? (
                <button
                  className="btn"
                  type="button"
                  onClick={() => patch({ retryLogs: [...state.retryLogs, "已记录重试，结果仍为失败待重试"] })}
                >
                  记录重试
                </button>
              ) : null}
              {openJob === job.id && job.article ? <div className="quote">{job.article.body}</div> : null}
            </article>
          ))}
          {state.retryLogs.map((log) => (
            <div key={log} className="tag amber">{log}</div>
          ))}
        </div>
      </section>
      ) : null}

      {step === "extract" ? (
      <section className="card">
        <div className="card-hd">
          <h2>文件抽取</h2>
          <div className="row">
            {uploads.map((item) => (
              <button key={item.id} className={activeUp === item.id ? "btn primary" : "btn"} type="button" onClick={() => setActiveUp(item.id as "UP-01" | "UP-02")}>
                {item.id} {item.kind}
              </button>
            ))}
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                patch({ extracted: { ...state.extracted, [activeUp]: true } });
                toast(activeUp === "UP-01" ? "UP-01 抽出 2 条指标" : "UP-02 文号标记为待核");
              }}
            >
              开始抽取
            </button>
          </div>
        </div>
        <div className="card-bd split">
          <div className="stack">
            <div>{sample.filename}</div>
            {state.extracted[activeUp] ? (
              <>
                <div><b>标题</b> {sample.title}</div>
                <div className="row">
                  <b>文号</b>
                  {sample.docNo ? sample.docNo : <Tag value="待核" />}
                  {sample.docNo ? <Tag value={sample.docNoStatus} /> : null}
                </div>
                <div>{sample.summary}</div>
                <table>
                  <thead>
                    <tr><th>指标</th><th>数值</th><th>位置</th></tr>
                  </thead>
                  <tbody>
                    {sample.indicators.map((item) => (
                      <tr key={item.id}>
                        <td>{item.street} {item.name}</td>
                        <td>{item.value} {item.unit || "待核"}</td>
                        <td>
                          <button className="btn" type="button" onClick={() => setAnchor(item.anchor)}>{item.position}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : <div className="quote">选择文件后开始抽取。</div>}
          </div>
          <div className="stack">
            {sample.body.map((part) => (
              <p key={part.anchor} className={anchor === part.anchor ? "quote on" : "quote"}>{part.text}</p>
            ))}
          </div>
        </div>
        <div className="card-bd" style={{ paddingTop: 0 }}>
          {activeUp === "UP-01" ? (
            <div className="quote">这条通知的文号是「协同〔2026〕31号」。抽出的 296、234 只交给办件分析，对上 DATA-04、DATA-08。政策依据不在这里，现行文件是归档里的 KB-003（07号）。</div>
          ) : (
            <div className="quote">UP-02 没有文号，状态是待核。抽出的 12 人次对上 DATA-X01，单位待补充，不进入 530。</div>
          )}
        </div>
      </section>
      ) : null}

      {step === "library" ? (
      <section className="card">
        <div className="card-hd">
          <h2>资料库与版本</h2>
          {can("archive") ? <button
            className="btn primary"
            type="button"
            disabled={state.archived}
            onClick={() => {
              patch({ archived: true });
              toast("落后者 KB-005 已归入内部文稿 KB-008");
            }}
          >
            {state.archived ? "已归入 KB-008" : "将落后者归入内部文稿"}
          </button> : null}
        </div>
        <div className="card-bd stack">
          <div className="split">
            <VersionCard doc={current} active={focus === "KB-003"} onClick={() => setFocus("KB-003")} />
            <VersionCard doc={previous} active={focus === "KB-005"} onClick={() => setFocus("KB-005")} />
          </div>
          <div className="quote">
            <b>{shown.id} · {shown.title}</b>
            <div>{shown.docNo} · {shown.summary}</div>
            {shown.articles.map((article) => <div key={article.no}>第 {article.no} 条 {article.text}</div>)}
          </div>
          <div className="quote">KB-003「协同〔2026〕07号」保持现行，交给依据检索。KB-005 是被替代的旧版，归档只生成内部稿 KB-008。</div>
          {state.archived ? <div className="quote"><Tag value="内部" /> KB-008 已由 KB-005 落入，KB-003 仍为现行。</div> : null}
          <div className="row">
            <Select label="类别" value={category} onChange={setCategory} options={["全部", "政策文件", "口径说明", "台账", "内部文稿"]} />
            <Select label="台账" value={ledger} onChange={setLedger} options={["全部", "台账", "非台账"]} />
            <Select label="层级" value={docLevel} onChange={setDocLevel} options={["全部", "中央", "省级", "市级", "本级"]} />
            <Select label="状态" value={status} onChange={setStatus} options={["全部", "现行", "已替代", "被替代", "内部"]} />
          </div>
          <table>
            <thead>
              <tr><th>编号</th><th>标题</th><th>文号</th><th>类别</th><th>层级</th><th>状态</th></tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.id}</td>
                  <td>{doc.title}</td>
                  <td>{doc.docNo}</td>
                  <td>{doc.category}</td>
                  <td>{doc.level}</td>
                  <td><Tag value={doc.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}
    </div>
  );
}

function readClock() {
  const saved = localStorage.getItem("gov-collect-clock") || "07:30";
  return parseClock(saved);
}

function parseClock(value: string) {
  const [hourText, minuteText] = value.split(":");
  const hour = Math.min(23, Math.max(0, Number(hourText) || 0));
  const minute = Math.min(59, Math.max(0, Number(minuteText) || 0));
  return { hour, minute };
}

function clockLabel(clock: { hour: number; minute: number }) {
  return `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
}

function nextDaily(clock: { hour: number; minute: number }, from = Date.now()) {
  const next = new Date(from);
  next.setHours(clock.hour, clock.minute, 0, 0);
  if (next.getTime() <= from) next.setDate(next.getDate() + 1);
  return next.getTime();
}

function VersionCard({ doc, active, onClick }: { doc: KnowledgeDoc; active: boolean; onClick: () => void }) {
  return (
    <button className={active ? "quote on" : "quote"} type="button" onClick={onClick} style={{ textAlign: "left" }}>
      <div className="row"><b>{doc.id}</b><Tag value={doc.status} /><span>{doc.level}</span></div>
      <div>{doc.title}</div>
      <div>{doc.docNo}</div>
    </button>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}
