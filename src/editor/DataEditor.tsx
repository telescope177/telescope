import { forwardRef, useImperativeHandle, useState } from "react";
import { downloadBlob } from "./docx";
import type { DocEditorHandle } from "./DocEditor";
import { downloadName } from "./open";

interface Field {
  key: string;
  value: string;
}

function clone(fields: Field[]) {
  return fields.map((item) => ({ ...item }));
}

export const DataEditor = forwardRef<DocEditorHandle, {
  fields: Field[];
  fileName: string;
  quote?: string;
  stale?: boolean;
  onEdit: () => void;
}>(function DataEditor({ fields, fileName, quote = "", stale = false, onEdit }, ref) {
  const [rows, setRows] = useState<Field[]>(() => clone(fields));
  const [, setPast] = useState<Field[][]>([]);
  const [status, setStatus] = useState("数据");

  function commit(next: Field[]) {
    setPast((stack) => [...stack.slice(-40), clone(rows)]);
    setRows(next);
    onEdit();
  }

  function update(index: number, patch: Partial<Field>) {
    commit(rows.map((item, row) => (row === index ? { ...item, ...patch } : item)));
  }

  useImperativeHandle(ref, () => ({
    plain: () => rows.map((item) => `${item.key} ${item.value}`).join("\n"),
    undo: () => {
      setPast((stack) => {
        const previous = stack[stack.length - 1];
        if (previous) setRows(previous);
        return stack.slice(0, -1);
      });
    },
    replaceFirst: (from, to) => {
      if (!from) {
        commit([...clone(rows), { key: "补充", value: to }]);
        return true;
      }
      const next = clone(rows);
      const hit = next.find((item) => item.value.includes(from));
      if (!hit) return false;
      hit.value = hit.value.replace(from, to);
      commit(next);
      return true;
    },
  }));

  function exportJson() {
    const data: Record<string, string> = {};
    rows.forEach((item) => {
      if (item.key) data[item.key] = item.value;
    });
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }), downloadName(fileName, ".json"));
    setStatus("已导出 json");
  }

  return (
    <section className="card doc-editor">
      <div className="doc-tabs">
        <button className="on" type="button">数据</button>
      </div>
      <div className="doc-tools">
        <button className="btn" type="button" onClick={() => {
          setPast((stack) => {
            const previous = stack[stack.length - 1];
            if (previous) setRows(previous);
            return stack.slice(0, -1);
          });
        }}>撤销</button>
        <button className="btn" type="button" onClick={() => commit([...clone(rows), { key: "", value: "" }])}>加一栏</button>
        <button className="btn" type="button" onClick={exportJson}>导出 json</button>
      </div>
      {stale ? <div className="quote on">正文已修改。请重新预审，避免用旧意见改到新正文。</div> : null}
      <div className="card-bd stack">
        {rows.map((item, index) => (
          <div key={index} className={`data-row${quote && item.value.includes(quote) ? " hit" : ""}`}>
            <input className="input" aria-label={`字段 ${index + 1}`} value={item.key} placeholder="字段" onChange={(event) => update(index, { key: event.target.value })} />
            <input className="input" aria-label={`取值 ${index + 1}`} value={item.value} placeholder="取值" onChange={(event) => update(index, { value: event.target.value })} />
            <button className="btn" type="button" onClick={() => commit(rows.filter((_, row) => row !== index))}>删除</button>
          </div>
        ))}
      </div>
      <div className="doc-status">
        <span>数据编辑</span>
        <span>{rows.length} 栏</span>
        <span>{status}</span>
      </div>
    </section>
  );
});
