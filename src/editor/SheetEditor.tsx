import { forwardRef, useImperativeHandle, useState } from "react";
import { downloadBlob } from "./docx";
import type { DocEditorHandle } from "./DocEditor";
import { downloadName } from "./open";
import { csvText, exportXlsx } from "./sheetio";

function clone(rows: string[][]) {
  return rows.map((line) => [...line]);
}

export const SheetEditor = forwardRef<DocEditorHandle, {
  rows: string[][];
  fileName: string;
  quote?: string;
  stale?: boolean;
  onEdit: () => void;
}>(function SheetEditor({ rows, fileName, quote = "", stale = false, onEdit }, ref) {
  const [grid, setGrid] = useState(() => clone(rows.length ? rows : [[""]]));
  const [, setPast] = useState<string[][][]>([]);
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [status, setStatus] = useState("表格");

  function commit(next: string[][]) {
    setPast((stack) => [...stack.slice(-40), clone(grid)]);
    setGrid(next);
    onEdit();
  }

  function write(row: number, col: number, value: string) {
    const next = clone(grid);
    next[row][col] = value;
    commit(next);
  }

  function addRow() {
    commit([...clone(grid), grid[0].map(() => "")]);
  }

  function addCol() {
    commit(grid.map((line) => [...line, ""]));
  }

  function dropRow(index: number) {
    if (grid.length <= 1) return;
    commit(grid.filter((_, row) => row !== index));
  }

  function replaceIn(all: boolean) {
    if (!find) return;
    const next = clone(grid);
    let count = 0;
    for (const line of next) {
      for (let col = 0; col < line.length; col += 1) {
        if (!line[col].includes(find)) continue;
        line[col] = all ? line[col].split(find).join(replace) : line[col].replace(find, replace);
        count += 1;
        if (!all) {
          commit(next);
          setStatus(`已替换 ${count} 处`);
          return;
        }
      }
    }
    if (!count) {
      setStatus("没有找到");
      return;
    }
    commit(next);
    setStatus(`已替换 ${count} 处`);
  }

  useImperativeHandle(ref, () => ({
    plain: () => grid.map((line) => line.join("\t")).join("\n"),
    undo: () => {
      setPast((stack) => {
        const previous = stack[stack.length - 1];
        if (!previous) return stack;
        setGrid(previous);
        return stack.slice(0, -1);
      });
    },
    replaceFirst: (from, to) => {
      if (!from) {
        commit([...clone(grid), [to]]);
        return true;
      }
      const next = clone(grid);
      for (const line of next) {
        for (let col = 0; col < line.length; col += 1) {
          const index = line[col].indexOf(from);
          if (index < 0) continue;
          line[col] = line[col].slice(0, index) + to + line[col].slice(index + from.length);
          commit(next);
          return true;
        }
      }
      return false;
    },
  }));

  const letters = grid[0]?.map((_, index) => String.fromCharCode(65 + (index % 26))) ?? [];

  return (
    <section className="card doc-editor">
      <div className="doc-tabs">
        <button className="on" type="button">表格</button>
      </div>
      <div className="doc-tools">
        <button className="btn" type="button" onClick={() => {
          setPast((stack) => {
            const previous = stack[stack.length - 1];
            if (previous) setGrid(previous);
            return stack.slice(0, -1);
          });
        }}>撤销</button>
        <button className="btn" type="button" onClick={addRow}>加一行</button>
        <button className="btn" type="button" onClick={addCol}>加一列</button>
        <input className="input" value={find} placeholder="查找" onChange={(event) => setFind(event.target.value)} />
        <input className="input" value={replace} placeholder="替换为" onChange={(event) => setReplace(event.target.value)} />
        <button className="btn" type="button" onClick={() => replaceIn(false)}>替换</button>
        <button className="btn" type="button" onClick={() => replaceIn(true)}>全部替换</button>
        <button className="btn" type="button" onClick={() => { downloadBlob(exportXlsx(grid), downloadName(fileName, ".xlsx")); setStatus("已导出 xlsx"); }}>导出 xlsx</button>
        <button className="btn" type="button" onClick={() => { downloadBlob(new Blob([csvText(grid)], { type: "text/csv;charset=utf-8" }), downloadName(fileName, ".csv")); setStatus("已导出 csv"); }}>导出 csv</button>
      </div>
      {stale ? <div className="quote on">正文已修改。请重新预审，避免用旧意见改到新正文。</div> : null}
      <div className="sheet-wrap">
        <table className="sheet-grid">
          <thead>
            <tr>
              <th />
              {letters.map((letter, index) => <th key={`${letter}-${index}`}>{letter}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {grid.map((line, row) => (
              <tr key={row}>
                <th>{row + 1}</th>
                {line.map((cell, col) => (
                  <td key={col} className={quote && cell.includes(quote) ? "hit" : ""}>
                    <input aria-label={`${letters[col] || col}${row + 1}`} value={cell} onChange={(event) => write(row, col, event.target.value)} />
                  </td>
                ))}
                <th><button className="btn" type="button" onClick={() => dropRow(row)}>删除</button></th>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="doc-status">
        <span>表格编辑</span>
        <span>{grid.length} 行 × {grid[0]?.length || 0} 列</span>
        <span>{status}</span>
      </div>
    </section>
  );
});
