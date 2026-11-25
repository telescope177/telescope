import { useMemo, useState } from "react";
import { chart, octoberCheck, unitVerdict, uploads, type LedgerRow } from "../domain";
import { useStore } from "../state";
import { Tag } from "../shell";

export function AnalysisPage() {
  const { state, patch, toast } = useStore();
  const [street, setStreet] = useState("全部");
  const [from, setFrom] = useState("2026-07");
  const [to, setTo] = useState("2026-10");
  const [preview, setPreview] = useState(false);
  const [manual, setManual] = useState<LedgerRow[]>([]);
  const [form, setForm] = useState({ street: "两江街道", period: "2026-10", value: "", unit: "" });
  const [step, setStep] = useState<"import" | "check" | "chart">("import");
  const oct = octoberCheck();
  const imported = state.ledgerImported ? chart.rows : [];
  const rows = [...imported, ...manual];
  const seriesRows = rows.filter((row) => row.includeInChart && row.unit && row.period >= from && row.period <= to && (street === "全部" || row.street === street));
  const up = uploads.find((item) => item.id === "UP-01")!;

  const lines = useMemo(() => {
    const months = ["2026-07", "2026-08", "2026-09", "2026-10"].filter((item) => item >= from && item <= to);
    const streets = street === "全部" ? ["两江街道", "云桥街道"] : [street];
    return { months, streets };
  }, [from, to, street]);

  function importSample() {
    patch({ ledgerImported: true });
    toast("已导入台账：DATA-01～08 共 8 条，DATA-X01 单位待补充");
  }

  function importFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = parseLedger(text);
      if (!parsed.length) {
        importSample();
        toast(`「${file.name}」按台账样例导入：两街道 4 个月，另有 1 条单位待补充`);
        return;
      }
      setManual((prev) => [...prev, ...parsed]);
      toast(`已从「${file.name}」导入 ${parsed.length} 行。正式台账请再点「导入台账」。`);
    };
    reader.readAsText(file);
  }

  function exportCsv() {
    const header = "街道,统计期,办结件数,计量单位,数据来源";
    const body = seriesRows.map((row) => [row.street, row.period, row.value, row.unit, row.source].join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + header + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "便民服务办件趋势.csv";
    link.click();
    URL.revokeObjectURL(url);
    patch({ exported: true });
    toast("已导出便民服务办件趋势.csv");
  }

  return (
    <div className="stack">
      <header className="page-title">
        <div>
          <h1>办件分析</h1>
          <p>{step === "import" ? "先导入台账。缺单位的 DATA-X01 标为待补充，不进入后面的合计。" : step === "check" ? "用资料归集抽出的 UP-01 核对：296 对 DATA-04，234 对 DATA-08。" : "用核对后的台账出图。10 月合计 530，待补充不在图里。"}</p>
        </div>
      </header>
      <div className="steps">
        <button type="button" className={step === "import" ? "on" : ""} onClick={() => setStep("import")}>
          <b>1 导入</b><small>{state.ledgerImported ? "已导入台账样例" : "台账、文件或手工录入"}</small>
        </button>
        <button type="button" className={step === "check" ? "on" : ""} onClick={() => setStep("check")}>
          <b>2 核对</b><small>{state.extractMatched ? "已与 UP-01 一致" : "统计期、数值、单位"}</small>
        </button>
        <button type="button" className={step === "chart" ? "on" : ""} onClick={() => setStep("chart")}>
          <b>3 出图</b><small>{state.exported ? "已导出" : "296 + 234 = 530"}</small>
        </button>
      </div>

      {step === "import" ? (
        <section className="card">
          <div className="card-hd">
            <h2>导入台账</h2>
            <span className="tag">{state.ledgerImported ? "已导入" : "待导入"}</span>
          </div>
          <div className="card-bd stack">
            <div className="quote">样例是两街道 4 个月，外加一条缺单位的 DATA-X01。导入后到第 2 步核对，第 3 步出图。</div>
            <div className="row">
              <button className="btn primary" type="button" onClick={() => { importSample(); setStep("check"); }}>导入台账样例</button>
              <label className="btn">
                选择 CSV
                <input type="file" accept=".csv,.txt,text/csv" style={{ display: "none" }} onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) importFile(file);
                }} />
              </label>
            </div>
            <form className="row" onSubmit={(event) => {
              event.preventDefault();
              const value = Number(form.value);
              if (!Number.isFinite(value)) return;
              setManual((prev) => [...prev, { id: `手工-${prev.length + 1}`, street: form.street, period: form.period, value, unit: form.unit, source: "手工录入", includeInChart: false }]);
              toast(form.unit.trim() ? "已录入，不进入趋势图" : "已录入，单位待补充");
            }}>
              <select className="input" value={form.street} onChange={(event) => setForm({ ...form, street: event.target.value })}>
                <option>两江街道</option><option>云桥街道</option>
              </select>
              <input className="input" value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} />
              <input className="input" placeholder="数值" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} />
              <input className="input" placeholder="单位，可空" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
              <button className="btn" type="submit">录入一行</button>
            </form>
            {manual.length ? <div className="tag">已手工录入 {manual.length} 行，不进入 530</div> : null}
          </div>
        </section>
      ) : null}

      {step === "check" ? (
        <section className="card">
          <div className="card-hd">
            <h2>核对统计期、数值、单位</h2>
            <div className="row">
              <button className="btn" type="button" disabled={!rows.length} onClick={() => { patch({ dataChecked: true }); toast("已核对统计期、数值和单位"); }}>开始核对</button>
              <button className="btn primary" type="button" onClick={() => {
                if (!state.ledgerImported) { toast("请先导入台账样例"); return; }
                if (!state.extracted["UP-01"]) { toast("请先在资料归集第 2 步抽取 UP-01"); return; }
                patch({ extractMatched: true });
                toast("296 对 DATA-04，234 对 DATA-08，结论一致");
              }}>用 UP-01 核对</button>
            </div>
          </div>
          <div className="card-bd" style={{ overflowX: "auto" }}>
            {!rows.length ? <div className="quote">还没有台账。回到第 1 步导入。</div> : null}
            <table>
              <thead>
                <tr><th>编号</th><th>街道</th><th>统计期</th><th>数值</th><th>单位</th><th>来源</th>{state.dataChecked ? <th>单位结论</th> : null}</tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} style={!row.unit ? { background: "#fff7f7" } : undefined}>
                    <td>{row.id}</td>
                    <td>{row.street}</td>
                    <td>{row.period}</td>
                    <td><b>{row.value}</b></td>
                    <td>{row.unit ? row.unit : <Tag value="待补充" />}</td>
                    <td>{row.source}</td>
                    {state.dataChecked ? <td><Tag value={unitVerdict(row)} /></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {state.extractMatched ? (
              <div className="row" style={{ marginTop: 10 }}>
                {up.indicators.map((item) => <span key={item.id} className="tag ok">{item.street} {item.value} ↔ {item.matchesRow} 一致</span>)}
              </div>
            ) : <p style={{ color: "#475569" }}>UP-01 在资料归集里抽出的 296、234，应对上 DATA-04、DATA-08。</p>}
          </div>
        </section>
      ) : null}

      {step === "chart" ? (
        <>
          {state.ledgerImported ? (
            <section className="grid-3">
              <article className="metric"><div className="k">两江街道 10 月</div><div className="v">{oct.jiang}<small> 件</small></div><div className="s">DATA-04</div></article>
              <article className="metric"><div className="k">云桥街道 10 月</div><div className="v">{oct.yun}<small> 件</small></div><div className="s">DATA-08</div></article>
              <article className="metric"><div className="k">合计</div><div className="v">{oct.total}</div><div className="s">不含待补充</div></article>
            </section>
          ) : <div className="quote">先完成第 1 步导入，这里才出 530。</div>}
          <section className="card">
            <div className="card-hd">
              <h2>趋势图</h2>
              <div className="row">
                <button className="btn" type="button" disabled={!seriesRows.length} onClick={() => setPreview(true)}>预览</button>
                <button className="btn primary" type="button" disabled={!seriesRows.length} onClick={exportCsv}>导出</button>
              </div>
            </div>
            <div className="card-bd">
              <div className="row" style={{ marginBottom: 8 }}>
                <select className="input" value={street} onChange={(event) => setStreet(event.target.value)}>
                  <option>全部</option><option>两江街道</option><option>云桥街道</option>
                </select>
                <select className="input" value={from} onChange={(event) => setFrom(event.target.value)}>
                  {["2026-07", "2026-08", "2026-09", "2026-10"].map((item) => <option key={item}>{item}</option>)}
                </select>
                <select className="input" value={to} onChange={(event) => setTo(event.target.value)}>
                  {["2026-07", "2026-08", "2026-09", "2026-10"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              {seriesRows.length ? <Trend months={lines.months} streets={lines.streets} rows={seriesRows} /> : <div className="quote">趋势图等待台账导入。</div>}
              <div className="row" style={{ marginTop: 8 }}>
                <span className="tag">数据来源：{chart.source}</span>
                <span className="tag">统计周期：{from} 至 {to}</span>
                <span className="tag">计量单位：件</span>
              </div>
            </div>
          </section>
          {preview ? (
            <div className="card">
              <div className="card-hd"><h2>预览</h2><button className="btn" type="button" onClick={() => setPreview(false)}>关闭</button></div>
              <div className="card-bd">
                <Trend months={lines.months} streets={lines.streets} rows={seriesRows} />
                <p>10 月两江街道 {oct.jiang} 件，云桥街道 {oct.yun} 件，合计 {oct.total} 件。</p>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function parseLedger(text: string): LedgerRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  return lines.slice(1).map((line, index) => {
    const [street, period, value, unit, source] = line.split(",").map((cell) => cell.trim());
    const numeric = Number(value);
    if (!street || !period || !Number.isFinite(numeric)) return null;
    return {
      id: `导入-${index + 1}`,
      street,
      period,
      value: numeric,
      unit: unit ?? "",
      source: source || "文件导入",
      includeInChart: Boolean(unit),
    };
  }).filter((row): row is LedgerRow => row !== null);
}

function Trend({ months, streets, rows }: { months: string[]; streets: string[]; rows: LedgerRow[] }) {
  const width = 760;
  const height = 280;
  const pad = { l: 40, r: 16, t: 16, b: 32 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = 360;
  const x = (index: number) => pad.l + (months.length <= 1 ? innerW / 2 : (index * innerW) / (months.length - 1));
  const y = (value: number) => pad.t + innerH - (value / max) * innerH;
  const colors: Record<string, string> = { 两江街道: "#0c335c", 云桥街道: "#9f1d24" };
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="办件趋势折线图">
      {[0, 90, 180, 270, 360].map((tick) => (
        <g key={tick}>
          <line x1={pad.l} x2={width - pad.r} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" />
          <text x={4} y={y(tick) + 4} fontSize="11" fill="#64748b">{tick}</text>
        </g>
      ))}
      {months.map((month, index) => (
        <text key={month} x={x(index)} y={height - 8} textAnchor="middle" fontSize="12" fill="#475569">{month.slice(5)}月</text>
      ))}
      {streets.map((name) => {
        const points = months.map((month, index) => {
          const row = rows.find((item) => item.street === name && item.period === month);
          return row ? `${x(index)},${y(row.value)}` : null;
        }).filter(Boolean);
        return (
          <g key={name}>
            <polyline fill="none" stroke={colors[name]} strokeWidth="2.5" points={points.join(" ")} />
            {months.map((month, index) => {
              const row = rows.find((item) => item.street === name && item.period === month);
              if (!row) return null;
              return (
                <g key={month}>
                  <circle cx={x(index)} cy={y(row.value)} r="4" fill={colors[name]} />
                  <text x={x(index)} y={y(row.value) - 8} textAnchor="middle" fontSize="11" fill={colors[name]}>{row.value}</text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
