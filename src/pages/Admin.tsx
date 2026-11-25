import { useEffect, useState } from "react";
import { api } from "../api";
import { ACTION_LABEL, BUSINESS_ACTIONS, type Action } from "../auth";
import { type BasisRow, type KnowledgeDoc } from "../domain";
import { useLiveBasis } from "../live-basis";
import { useStore } from "../state";

const ROLES = ["管理员", "主管", "用户"] as const;

export function AdminPage() {
  const { can, toast } = useStore();
  const modelOn = can("model");
  const grantOn = can("grant");
  const auditOn = can("audit");
  const live = useLiveBasis();
  const [base, setBase] = useState("");
  const [model, setModel] = useState("");
  const [key, setKey] = useState("");
  const [hint, setHint] = useState("");
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [rows, setRows] = useState<BasisRow[]>([]);
  const [docId, setDocId] = useState("KB-003");
  const [grants, setGrants] = useState<Record<string, Action[]>>({});
  const [logs, setLogs] = useState<{ at: string; username: string; role: string; event: string; detail: string }[]>([]);

  useEffect(() => {
    if (!modelOn) return;
    api("/api/model").then((body) => {
      const item = body.model as { base?: string; model?: string; keyHint?: string };
      setBase(item.base || "");
      setModel(item.model || "");
      setHint(item.keyHint || "");
      setKey("");
    }).catch(() => undefined);
  }, [modelOn]);

  useEffect(() => {
    setDocs(live.knowledge);
    setRows(live.basis);
  }, [live.knowledge, live.basis]);

  useEffect(() => {
    if (!grantOn) return;
    api("/api/permissions").then((body) => setGrants((body.grants || {}) as Record<string, Action[]>)).catch(() => undefined);
  }, [grantOn]);

  useEffect(() => {
    if (!auditOn) return;
    api("/api/audit").then((body) => setLogs((body.items || []) as typeof logs)).catch(() => undefined);
  }, [auditOn]);

  const current = docs.find((item) => item.id === docId) ?? docs[0];

  function patchDoc(partial: Partial<KnowledgeDoc>) {
    if (!current) return;
    setDocs(docs.map((item) => item.id === current.id ? { ...item, ...partial } : item));
  }

  return (
    <div className="stack">
      <header className="page-title">
        <div>
          <h1>系统后台</h1>
          <p>系统管理员配置模型和依据，安全保密管理员分配业务权限，安全审计员只看日志。</p>
        </div>
      </header>
      {can("model") ? (
        <section className="card">
          <div className="card-hd"><h2>大模型</h2>{hint ? <span className="tag">密钥 {hint}</span> : <span className="tag">未单独配置密钥</span>}</div>
          <div className="card-bd stack">
            <label className="field">接口地址
              <input className="input" value={base} placeholder="留空则用环境变量" onChange={(event) => setBase(event.target.value)} />
            </label>
            <label className="field">模型名称
              <input className="input" value={model} placeholder="deepseek-chat" onChange={(event) => setModel(event.target.value)} />
            </label>
            <label className="field">API 密钥
              <input className="input" type="password" value={key} placeholder={hint ? "留空则保持原密钥" : "只保存在服务器"} onChange={(event) => setKey(event.target.value)} />
            </label>
            <button className="btn primary" type="button" onClick={() => void api("/api/model", { method: "PUT", body: JSON.stringify({ base, model, key }) }).then((body) => {
              const item = body.model as { keyHint?: string };
              setHint(item.keyHint || "");
              setKey("");
              toast("大模型配置已保存");
            }).catch((cause) => toast(cause instanceof Error ? cause.message : "没有保存"))}>保存模型</button>
          </div>
        </section>
      ) : null}
      {can("basis") && current ? (
        <section className="card">
          <div className="card-hd"><h2>审核依据</h2></div>
          <div className="card-bd stack">
            <label className="field">文稿
              <select className="input" value={current.id} onChange={(event) => setDocId(event.target.value)}>
                {docs.map((item) => <option key={item.id} value={item.id}>{item.id} {item.title}</option>)}
              </select>
            </label>
            <label className="field">文号
              <input className="input" value={current.docNo} onChange={(event) => patchDoc({ docNo: event.target.value })} />
            </label>
            <label className="field">摘要
              <textarea className="input" value={current.summary} onChange={(event) => patchDoc({ summary: event.target.value })} />
            </label>
            <label className="field">条款（一行一条）
              <textarea className="input" value={current.articles.map((item) => item.text).join("\n")} onChange={(event) => patchDoc({ articles: event.target.value.split("\n").filter((line) => line.trim()).map((text, index) => ({ no: index + 1, text })) })} />
            </label>
            {rows.map((row, index) => (
              <div key={row.item} className="stack">
                <b>{row.item}</b>
                <label className="field">现行
                  <input className="input" value={row.current} onChange={(event) => setRows(rows.map((item, at) => at === index ? { ...item, current: event.target.value } : item))} />
                </label>
                <label className="field">前稿
                  <input className="input" value={row.previous} onChange={(event) => setRows(rows.map((item, at) => at === index ? { ...item, previous: event.target.value } : item))} />
                </label>
              </div>
            ))}
            <button className="btn primary" type="button" onClick={() => void api("/api/basis", { method: "PUT", body: JSON.stringify({ knowledge: docs, basis: rows }) }).then(() => {
              live.reload();
              toast("审核依据已保存");
            }).catch((cause) => toast(cause instanceof Error ? cause.message : "没有保存"))}>保存依据</button>
          </div>
        </section>
      ) : null}
      {can("grant") ? (
        <section className="card">
          <div className="card-hd"><h2>业务权限</h2></div>
          <div className="card-bd stack">
            {ROLES.map((role) => (
              <div key={role} className="stack">
                <b>{role}</b>
                <div className="row">
                  {BUSINESS_ACTIONS.map((action) => (
                    <label key={action} className="tag">
                      <input
                        type="checkbox"
                        checked={(grants[role] || []).includes(action)}
                        onChange={(event) => {
                          const owned = new Set(grants[role] || []);
                          if (event.target.checked) owned.add(action);
                          else owned.delete(action);
                          setGrants({ ...grants, [role]: BUSINESS_ACTIONS.filter((item) => owned.has(item)) });
                        }}
                      /> {ACTION_LABEL[action]}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button className="btn primary" type="button" onClick={() => void api("/api/permissions", { method: "PUT", body: JSON.stringify({ grants }) }).then((body) => {
              setGrants((body.grants || grants) as Record<string, Action[]>);
              toast("权限已保存，相关账号重新登录后生效");
            }).catch((cause) => toast(cause instanceof Error ? cause.message : "没有保存"))}>保存权限</button>
          </div>
        </section>
      ) : null}
      {can("audit") ? (
        <section className="card">
          <div className="card-hd"><h2>审计日志</h2><span className="tag">{logs.length} 条</span></div>
          <div className="card-bd">
            {logs.length === 0 ? <div className="quote">还没有操作记录。</div> : null}
            <table>
              <thead><tr><th>时间</th><th>账号</th><th>角色</th><th>事件</th><th>说明</th></tr></thead>
              <tbody>
                {[...logs].reverse().map((item, index) => (
                  <tr key={`${item.at}-${index}`}><td>{item.at.replace("T", " ").slice(0, 19)}</td><td>{item.username}</td><td>{item.role}</td><td>{item.event}</td><td>{item.detail}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
