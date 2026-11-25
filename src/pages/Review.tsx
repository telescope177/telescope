import { useState } from "react";
import { authHeaders } from "../api";
import { draft, inspect, oaTasks } from "../domain";
import { useLiveBasis } from "../live-basis";
import { DraftPaper } from "../paper";
import { useStore } from "../state";
import { Tag } from "../shell";

export function ReviewPage() {
  const { state, patch, toast, can } = useStore();
  const { knowledge, basis } = useLiveBasis();
  const [current, setCurrent] = useState<(typeof oaTasks)[number]["id"]>("OA-001");
  const [opinion, setOpinion] = useState("");
  const [active, setActive] = useState<string[]>([]);
  const [showBasis, setShowBasis] = useState(false);
  const task = oaTasks.find((item) => item.id === current)!;
  const list = inspect(task.version);
  const history = task.version === "v1" && state.returned && current === "OA-003";

  function openTask(id: (typeof oaTasks)[number]["id"]) {
    setCurrent(id);
    setActive([]);
    setShowBasis(false);
  }

  function reuse() {
    patch({ reused: true });
    toast("已复用 v1 检查结果，未重新计算");
  }

  function reject() {
    if (!opinion.trim()) {
      toast("退回意见为必填");
      return;
    }
    patch({ returned: true, returnOpinion: opinion });
    toast("已退回，4 条历史结果仍保留");
    void fetch("/api/audit", { method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ event: "审核退回", detail: opinion.trim() }) }).catch(() => undefined);
  }

  return (
    <div className="stack">
      <header className="page-title">
        <div>
          <h1>审核办理</h1>
          <p>{task.version === "v1" ? "先选 v1 办件。这 4 条来自文稿预审，重复提交直接复用。" : "v2 单独计算，结果是 0 条，状态保持待人工复核。"}</p>
        </div>
        <div className="seg">
          <button className={task.version === "v1" ? "on" : ""} type="button" onClick={() => openTask("OA-001")}>v1 · 4 条</button>
          <button className={task.version === "v2" ? "on" : ""} type="button" onClick={() => openTask("OA-004")}>v2 · 0 条</button>
        </div>
      </header>
      <div className="task-row">
        {oaTasks.filter((item) => item.version === task.version).map((item) => (
          <button key={item.id} className={current === item.id ? "oa on" : "oa"} type="button" onClick={() => openTask(item.id)}>
            <div className="row">
              <b>{item.id}</b>
              <Tag value={item.version === "v2" ? "待人工复核" : taskStatus(item.id, item.initialStatus, state.reused, state.returned)} />
            </div>
            <div>{item.node}</div>
          </button>
        ))}
      </div>
      <div className="split even">
        <DraftPaper version={task.version} active={active} />
        <section className="stack">
          <div className="card">
            <div className="card-hd">
              <h2>{task.id} · {draft.id} {task.version}</h2>
              <span className="tag">{history ? "历史检查结果" : "复核问题"} {list.length} 条</span>
            </div>
            <div className="card-bd stack">
              {state.reused && task.version === "v1" ? <div className="tag info">已复用 v1 检查结果，未重新计算</div> : null}
              {list.length === 0 ? <div className="quote">v2 历史结果 0 条。不继承 v1 的错字、缺日期、旧版和范围问题。</div> : null}
              {list.map((issue) => (
                <div key={issue.id} className="issue">
                  <b>{issue.id} {issue.title}</b>
                  <span>{issue.detail}</span>
                  <div className="row" style={{ marginTop: 6 }}>
                    <button className="btn" type="button" onClick={() => {
                      setActive(issue.anchors);
                      setShowBasis(false);
                      document.querySelector(`[data-anchor="${issue.anchors[0]}"]`)?.scrollIntoView({ block: "center" });
                    }}>定位原文</button>
                    {issue.clause ? <button className="btn" type="button" onClick={() => setShowBasis(true)}>查看依据</button> : null}
                  </div>
                </div>
              ))}
              {showBasis ? (
                <div className="quote">
                  <b>KB-003 第 2 条</b>
                  <div>{knowledge.find((item) => item.id === "KB-003")?.articles.find((article) => article.no === 2)?.text}</div>
                  {basis.map((row) => <div key={row.item}>{row.item}：现行 {row.current}；稿件 {row.draftV1}</div>)}
                </div>
              ) : null}
              {can("review") && task.id === "OA-002" ? <button className="btn primary" type="button" onClick={reuse}>重复提交，复用这 4 条</button> : null}
              {task.id === "OA-004" ? <button className="btn" type="button" onClick={() => toast("按 v2 单独计算，结果仍是 0 条")}>发起检查</button> : null}
            </div>
          </div>
          {task.id === "OA-003" ? (
            <div className="card">
              <div className="card-hd"><h2>退回留痕</h2></div>
              <div className="card-bd stack">
                <textarea className="input" value={opinion} onChange={(event) => setOpinion(event.target.value)} placeholder="退回意见，必填" />
                {can("review") ? <button className="btn danger" type="button" onClick={reject}>退回，并保留历史结果</button> : null}
                {state.returned ? <div className="quote">留痕 · 已退回 · {state.returnOpinion}</div> : null}
              </div>
            </div>
          ) : null}
          {task.id === "OA-004" ? (
            <div className="card">
              <div className="card-hd"><h2>复核意见</h2><Tag value="待人工复核" /></div>
              <div className="card-bd stack">
                <textarea className="input" value={state.reviewOpinion} onChange={(event) => patch({ reviewOpinion: event.target.value })} placeholder="可记录意见，状态仍是待人工复核" />
                <button className="btn" type="button" onClick={() => toast("已记下复核意见，状态仍为待人工复核")}>记录意见</button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function taskStatus(id: string, initial: string, reused: boolean, returned: boolean) {
  if (id === "OA-002" && reused) return "已复用";
  if (id === "OA-003" && returned) return "已退回";
  return initial;
}
