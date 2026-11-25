import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { downloadBlob, exportDocx, importDocx } from "./docx";
import { downloadName } from "./open";

export interface DocEditorHandle {
  plain: () => string;
  replaceFirst: (from: string, to: string) => boolean;
  undo: () => void;
}

const TABS = ["文件", "开始", "插入", "布局", "引用", "审阅", "视图"] as const;
const FONTS = ["仿宋", "宋体", "黑体", "楷体", "微软雅黑"];
const SIZES = ["12pt", "14pt", "16pt", "18pt", "22pt"];
const NOTICE = `<h1 class="doc-h-title">关于××的通知</h1><p class="doc-h-no">××〔2026〕×号</p><p class="doc-h-main">各有关单位：</p><p class="doc-h-body">正文从这里开始。</p><p class="doc-h-attach">附件：1. ××</p><p class="doc-h-sign">××单位</p><p class="doc-h-date">2026年1月1日</p>`;

function textToHtml(text: string) {
  const rows = text.split(/\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  return (rows.length ? rows : [""]).map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`).join("");
}

function RibbonGroup({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="wps-group">
      <div className="wps-group-body">{children}</div>
      <span className="wps-group-name">{name}</span>
    </div>
  );
}

function blockOf(node: Node | null, root: HTMLElement | null) {
  let current: Node | null = node;
  while (current && current instanceof HTMLElement === false) current = current.parentNode;
  while (current instanceof HTMLElement && current !== root && !/^(P|H1|H2|H3|LI|TD)$/.test(current.tagName)) current = current.parentElement;
  return current instanceof HTMLElement && current !== root ? current : null;
}

export const DocEditor = forwardRef<DocEditorHandle, {
  html: string;
  mode?: "word" | "text";
  fileName?: string;
  quote?: string;
  stale?: boolean;
  onPlain: (text: string) => void;
  onEdit: () => void;
}>(function DocEditor({ html, mode = "word", fileName = "文稿", quote = "", stale = false, onPlain, onEdit }, ref) {
  const sheet = useRef<HTMLDivElement>(null);
  const history = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const savedRange = useRef<Range | null>(null);
  const usingTools = useRef(false);
  const [tab, setTab] = useState<(typeof TABS)[number]>("开始");
  const word = mode === "word";
  const tabs = word ? TABS : (["文件", "开始", "审阅"] as const);
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [status, setStatus] = useState("未保存");
  const [zoom, setZoom] = useState(100);
  const [words, setWords] = useState(0);
  const [brushOn, setBrushOn] = useState(false);
  const [mini, setMini] = useState<{ top: number; left: number } | null>(null);
  const brush = useRef<Record<string, string> | null>(null);
  const brushReady = useRef(false);

  function captureRange() {
    if (usingTools.current) return;
    const root = sheet.current;
    const selection = getSelection();
    if (!root || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (root.contains(range.commonAncestorContainer)) savedRange.current = range.cloneRange();
  }

  function restoreRange() {
    const root = sheet.current;
    const range = savedRange.current;
    if (!root || !range || !root.contains(range.commonAncestorContainer)) return false;
    const selection = getSelection();
    if (!selection) return false;
    root.focus();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function remember() {
    const current = sheet.current?.innerHTML ?? "";
    const stack = history.current;
    if (stack[stack.length - 1] !== current) stack.push(current);
    if (stack.length > 40) stack.shift();
    future.current = [];
  }

  function undoEdit() {
    const root = sheet.current;
    if (!root) return;
    const stack = history.current;
    const current = root.innerHTML;
    const previous = stack[stack.length - 1];
    if (previous && previous !== current) {
      future.current.push(current);
      root.innerHTML = previous;
      sync();
      return;
    }
    if (stack.length >= 2) {
      future.current.push(current);
      stack.pop();
      root.innerHTML = stack[stack.length - 1] || "<p><br></p>";
      sync();
      return;
    }
    root.focus();
    document.execCommand("undo");
    sync();
  }

  function redoEdit() {
    const root = sheet.current;
    const next = future.current.pop();
    if (!root || next === undefined) {
      root?.focus();
      document.execCommand("redo");
      sync();
      return;
    }
    const current = root.innerHTML;
    if (history.current[history.current.length - 1] !== current) history.current.push(current);
    root.innerHTML = next;
    sync();
  }

  function sync() {
    const root = sheet.current;
    if (!root) return;
    const text = root.innerText.replace(/\u00a0/g, " ").trim();
    setWords(text.replace(/\s/g, "").length);
    onPlain(text);
  }

  useEffect(() => {
    const onSelect = () => captureRange();
    const release = () => { usingTools.current = false; };
    document.addEventListener("selectionchange", onSelect);
    window.addEventListener("pointerup", release);
    return () => {
      document.removeEventListener("selectionchange", onSelect);
      window.removeEventListener("pointerup", release);
    };
  }, []);

  useEffect(() => {
    const root = sheet.current;
    if (!root) return;
    root.innerHTML = html || "<p><br></p>";
    history.current = [root.innerHTML];
    future.current = [];
    sync();
  }, [html]);

  useEffect(() => {
    const root = sheet.current;
    if (!root) return;
    root.querySelectorAll("mark.hl").forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
      parent.normalize();
    });
    if (!quote) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.nodeValue || "";
      const index = text.indexOf(quote);
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + quote.length);
        const mark = document.createElement("mark");
        mark.className = "hl on";
        range.surroundContents(mark);
        mark.scrollIntoView({ block: "center" });
        break;
      }
      node = walker.nextNode();
    }
  }, [quote, html]);

  useImperativeHandle(ref, () => ({
    plain: () => sheet.current?.innerText.replace(/\u00a0/g, " ").trim() ?? "",
    undo: () => undoEdit(),
    replaceFirst: (from, to) => {
      const root = sheet.current;
      if (!root) return false;
      remember();
      if (!from) {
        root.insertAdjacentHTML("beforeend", `<p class="doc-h-date">${to}</p>`);
        sync();
        return true;
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const text = node.nodeValue || "";
        const index = text.indexOf(from);
        if (index >= 0) {
          node.nodeValue = text.slice(0, index) + to + text.slice(index + from.length);
          root.normalize();
          sync();
          return true;
        }
        node = walker.nextNode();
      }
      return false;
    },
  }));

  function command(name: string, value?: string) {
    if (!restoreRange()) {
      setStatus("请先在正文里点一下或选中文字");
      return;
    }
    remember();
    document.execCommand(name, false, value);
    captureRange();
    sync();
    onEdit();
    setStatus("已应用到正文");
  }

  function styleSelection(style: Record<string, string>) {
    if (!restoreRange()) {
      setStatus("请先在正文里点一下或选中文字");
      return;
    }
    const selection = getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    remember();
    if (range.collapsed) {
      const block = blockOf(range.startContainer, sheet.current);
      if (!block) return;
      Object.assign(block.style, style);
    } else {
      const span = document.createElement("span");
      Object.assign(span.style, style);
      span.appendChild(range.extractContents());
      range.insertNode(span);
      const next = document.createRange();
      next.selectNodeContents(span);
      selection.removeAllRanges();
      selection.addRange(next);
      savedRange.current = next.cloneRange();
    }
    sync();
    onEdit();
    setStatus("已应用到正文");
  }

  function styleBlock(className: string, style: Partial<CSSStyleDeclaration> = {}) {
    if (!restoreRange()) {
      setStatus("请先在正文里点一下或选中文字");
      return;
    }
    const block = blockOf(getSelection()?.anchorNode ?? null, sheet.current);
    if (!block) {
      setStatus("请点进要修改的段落");
      return;
    }
    remember();
    if (className) block.className = className;
    Object.assign(block.style, style);
    sync();
    onEdit();
    setStatus("已应用到当前段落");
  }

  function listLevel(delta: number) {
    if (!restoreRange()) {
      setStatus("请先在正文里点一下或选中文字");
      return;
    }
    const node = blockOf(getSelection()?.anchorNode ?? null, sheet.current);
    const item = node?.closest("li");
    if (!item) {
      command("insertOrderedList");
      return;
    }
    remember();
    const level = Math.min(3, Math.max(1, Number(item.dataset.level || 1) + delta));
    item.dataset.level = String(level);
    item.style.marginLeft = `${(level - 1) * 1.5}em`;
    sync();
  }

  function insertTable() {
    command("insertHTML", `<table><tbody>${"<tr><td><br></td><td><br></td><td><br></td></tr>".repeat(3)}</tbody></table><p><br></p>`);
  }

  function tableEdit(action: "row" | "col" | "del") {
    if (!restoreRange()) {
      setStatus("请先点进表格");
      return;
    }
    const cell = blockOf(getSelection()?.anchorNode ?? null, sheet.current)?.closest("td");
    const row = cell?.parentElement;
    const table = cell?.closest("table");
    if (!cell || !row || !table) {
      setStatus("请先点进表格中的单元格");
      return;
    }
    remember();
    if (action === "row") row.after(row.cloneNode(true));
    if (action === "del" && row.parentElement) row.remove();
    if (action === "col") {
      const index = [...row.children].indexOf(cell);
      [...table.rows].forEach((line) => {
        const born = document.createElement("td");
        born.innerHTML = "<br>";
        line.insertBefore(born, line.children[index + 1] ?? null);
      });
    }
    sync();
  }

  function replaceAll(all: boolean) {
    const root = sheet.current;
    if (!root || !find) return;
    remember();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let count = 0;
    let node = walker.nextNode();
    while (node) {
      const text = node.nodeValue || "";
      if (text.includes(find)) {
        node.nodeValue = all ? text.split(find).join(replace) : text.replace(find, replace);
        count += 1;
        if (!all) break;
      }
      node = walker.nextNode();
    }
    setStatus(count ? `已替换 ${count} 处` : "没有找到");
    sync();
  }

  async function onFile(file: File) {
    const name = file.name.toLowerCase();
    if (word && !name.endsWith(".docx") && !name.endsWith(".txt")) {
      setStatus("请用上方「打开文稿」，以便按类型切换编辑器");
      return;
    }
    const next = name.endsWith(".docx") ? await importDocx(await file.arrayBuffer()) : textToHtml(await file.text());
    if (!sheet.current || !next) return;
    remember();
    sheet.current.innerHTML = next;
    setStatus(`已打开 ${file.name}`);
    sync();
    onEdit();
  }

  function saveLocal() {
    localStorage.setItem("gov-doc-draft", sheet.current?.innerHTML || "");
    setStatus("已保存到浏览器");
  }

  function exportWord() {
    if (!sheet.current) return;
    downloadBlob(exportDocx(sheet.current), downloadName(fileName, ".docx"));
    setStatus("已导出 Word");
  }

  function exportTxt() {
    const text = sheet.current?.innerText || "";
    downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), downloadName(fileName, ".txt"));
    setStatus("已导出 TXT");
  }

  function clip(name: "cut" | "copy") {
    if (!restoreRange()) {
      setStatus("请先选中文字");
      return;
    }
    remember();
    document.execCommand(name);
    setStatus(name === "cut" ? "已剪切" : "已复制");
    sync();
  }

  async function pasteText() {
    if (!restoreRange()) {
      setStatus("请先点进正文");
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      remember();
      document.execCommand("insertText", false, text);
      sync();
      onEdit();
      setStatus("已粘贴");
    } catch {
      setStatus("浏览器限制了粘贴，请用 Ctrl+V");
    }
  }

  function pickBrush() {
    if (!restoreRange()) {
      setStatus("请先选中要吸取的文字");
      return;
    }
    const node = getSelection()?.anchorNode;
    const el = node instanceof HTMLElement ? node : node?.parentElement;
    if (!el) return;
    const style = getComputedStyle(el);
    brush.current = {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      textDecoration: style.textDecorationLine,
      color: style.color,
      backgroundColor: style.backgroundColor,
    };
    brushReady.current = false;
    setBrushOn(true);
    window.setTimeout(() => { brushReady.current = true; }, 0);
    setStatus("格式刷已吸取，再选中要套用的文字");
  }

  function applyBrush() {
    if (!brushOn || !brushReady.current || !brush.current) return;
    const style = brush.current;
    brushReady.current = false;
    setBrushOn(false);
    styleSelection({
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: Number.parseInt(style.fontWeight, 10) >= 600 ? "700" : "400",
      fontStyle: style.fontStyle,
      textDecoration: style.textDecoration,
      color: style.color,
      backgroundColor: style.backgroundColor,
    });
    setStatus("已套用格式");
  }

  function placeMini() {
    const root = sheet.current;
    const wrap = root?.parentElement;
    const selection = getSelection();
    if (!root || !wrap || !selection?.rangeCount || selection.isCollapsed) {
      setMini(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      setMini(null);
      return;
    }
    if (brushOn && brushReady.current) applyBrush();
    const rect = range.getBoundingClientRect();
    const host = wrap.getBoundingClientRect();
    setMini({ top: Math.max(4, rect.top - host.top - 42), left: Math.max(8, rect.left - host.left) });
  }

  function shiftIndent(delta: number) {
    if (!restoreRange()) {
      setStatus("请先点进要修改的段落");
      return;
    }
    const block = blockOf(getSelection()?.anchorNode ?? null, sheet.current);
    if (!block) return;
    remember();
    const current = Number.parseFloat(block.style.marginLeft) || 0;
    block.style.marginLeft = `${Math.max(0, current + delta)}em`;
    sync();
    onEdit();
    setStatus(delta > 0 ? "已增加缩进" : "已减少缩进");
  }

  return (
    <section className="card doc-editor">
      <div className="wps-quick" onMouseDown={(event) => { usingTools.current = true; event.preventDefault(); }}>
        <button className="wps-ico" type="button" onClick={saveLocal}>保存</button>
        <button className="wps-ico" type="button" onClick={undoEdit}>撤销</button>
        <button className="wps-ico" type="button" onClick={redoEdit}>重做</button>
      </div>
      <div className="doc-tabs">
        {tabs.map((item) => (
          <button key={item} className={tab === item ? "on" : ""} type="button" onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      <div className="wps-ribbon" onMouseDown={(event) => {
        usingTools.current = true;
        const target = event.target;
        if (!(target instanceof HTMLElement) || target.closest("select, input, label, textarea")) return;
        event.preventDefault();
      }} onMouseUp={() => { usingTools.current = false; }}>
        {tab === "文件" ? (
          <>
            <RibbonGroup name="文档">
              <button className="wps-cmd" type="button" onClick={() => { if (sheet.current) { remember(); sheet.current.innerHTML = "<p><br></p>"; sync(); } }}>新建</button>
              {word ? <button className="wps-cmd" type="button" onClick={() => { if (sheet.current) { remember(); sheet.current.innerHTML = NOTICE; sync(); } }}>通知模板</button> : null}
              <label className="wps-cmd">打开<input type="file" accept={word ? ".docx,.txt" : ".txt,.md"} hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void onFile(file); }} /></label>
            </RibbonGroup>
            <RibbonGroup name="输出">
              <button className="wps-cmd" type="button" onClick={saveLocal}>保存</button>
              {word ? <button className="wps-cmd" type="button" onClick={exportWord}>导出 Word</button> : null}
              <button className="wps-cmd" type="button" onClick={exportTxt}>导出 TXT</button>
              {word ? <button className="wps-cmd" type="button" onClick={() => window.print()}>打印</button> : null}
            </RibbonGroup>
          </>
        ) : null}
        {tab === "开始" ? (
          <>
            <RibbonGroup name="剪贴板">
              <button className="wps-cmd tall" type="button" onClick={() => void pasteText()}>粘贴</button>
              <button className="wps-ico" type="button" onClick={() => clip("cut")}>剪切</button>
              <button className="wps-ico" type="button" onClick={() => clip("copy")}>复制</button>
              {word ? <button className={`wps-ico${brushOn ? " on" : ""}`} type="button" onClick={pickBrush}>格式刷</button> : null}
            </RibbonGroup>
            {word ? (
              <RibbonGroup name="字体">
                <select className="input wps-font" aria-label="字体" defaultValue="仿宋" onChange={(event) => styleSelection({ fontFamily: event.target.value })}>
                  {FONTS.map((font) => <option key={font}>{font}</option>)}
                </select>
                <select className="input wps-size" aria-label="字号" defaultValue="16pt" onChange={(event) => styleSelection({ fontSize: event.target.value })}>
                  {SIZES.map((size) => <option key={size}>{size}</option>)}
                </select>
                <button className="wps-ico" type="button" onClick={() => command("bold")}><b>B</b></button>
                <button className="wps-ico" type="button" onClick={() => command("italic")}><i>I</i></button>
                <button className="wps-ico" type="button" onClick={() => command("underline")}><u>U</u></button>
                <button className="wps-ico" type="button" onClick={() => command("strikeThrough")}>S</button>
                <input aria-label="字体颜色" type="color" defaultValue="#0f172a" onChange={(event) => command("foreColor", event.target.value)} />
                <input aria-label="高亮" type="color" defaultValue="#fde68a" onChange={(event) => command("hiliteColor", event.target.value)} />
                <button className="wps-ico" type="button" onClick={() => command("removeFormat")}>清除</button>
              </RibbonGroup>
            ) : null}
            {word ? (
              <RibbonGroup name="段落">
                <button className="wps-ico" type="button" onClick={() => command("justifyLeft")}>左</button>
                <button className="wps-ico" type="button" onClick={() => command("justifyCenter")}>中</button>
                <button className="wps-ico" type="button" onClick={() => command("justifyRight")}>右</button>
                <button className="wps-ico" type="button" onClick={() => command("justifyFull")}>两端</button>
                <button className="wps-ico" type="button" onClick={() => listLevel(0)}>编号</button>
                <button className="wps-ico" type="button" onClick={() => listLevel(1)}>下级</button>
                <button className="wps-ico" type="button" onClick={() => shiftIndent(-1)}>减缩进</button>
                <button className="wps-ico" type="button" onClick={() => shiftIndent(1)}>加缩进</button>
                <button className="wps-ico" type="button" onClick={() => styleBlock("doc-h-body", { textIndent: "2em" })}>首行缩进</button>
                <select className="input wps-size" aria-label="行距" defaultValue="1.8" onChange={(event) => styleBlock("", { lineHeight: event.target.value })}>
                  <option value="1">行距 1.0</option>
                  <option value="1.5">行距 1.5</option>
                  <option value="1.8">行距 1.8</option>
                  <option value="2">行距 2.0</option>
                </select>
              </RibbonGroup>
            ) : null}
            {word ? (
              <RibbonGroup name="样式">
                <select className="input wps-font" aria-label="公文样式" defaultValue="" onChange={(event) => { if (event.target.value) styleBlock(event.target.value, event.target.value === "doc-h-title" || event.target.value.endsWith("sign") || event.target.value.endsWith("date") ? { textIndent: "0" } : {}); }}>
                  <option value="">公文样式</option>
                  <option value="doc-h-title">标题</option>
                  <option value="doc-h-no">发文字号</option>
                  <option value="doc-h-main">主送机关</option>
                  <option value="doc-h-body">正文</option>
                  <option value="doc-h-attach">附件说明</option>
                  <option value="doc-h-sign">落款</option>
                  <option value="doc-h-date">成文日期</option>
                </select>
              </RibbonGroup>
            ) : null}
            <RibbonGroup name="编辑">
              <input className="input wps-find" value={find} placeholder="查找" onChange={(event) => setFind(event.target.value)} />
              <input className="input wps-find" value={replace} placeholder="替换为" onChange={(event) => setReplace(event.target.value)} />
              <button className="wps-ico" type="button" onClick={() => replaceAll(false)}>替换</button>
              <button className="wps-ico" type="button" onClick={() => replaceAll(true)}>全部</button>
            </RibbonGroup>
          </>
        ) : null}
        {tab === "插入" ? (
          <RibbonGroup name="表格">
            <button className="wps-cmd" type="button" onClick={insertTable}>插入表格</button>
            <button className="wps-ico" type="button" onClick={() => tableEdit("row")}>加一行</button>
            <button className="wps-ico" type="button" onClick={() => tableEdit("col")}>加一列</button>
            <button className="wps-ico" type="button" onClick={() => tableEdit("del")}>删除行</button>
            <button className="wps-cmd" type="button" onClick={() => command("insertHTML", `<p style="page-break-before:always"><br></p>`)}>分页符</button>
          </RibbonGroup>
        ) : null}
        {tab === "布局" ? (
          <RibbonGroup name="页面设置">
            <button className="wps-cmd" type="button" onClick={() => sheet.current?.style.setProperty("padding", "25mm 20mm")}>页边距适中</button>
            <button className="wps-cmd" type="button" onClick={() => sheet.current?.style.setProperty("padding", "12mm 10mm")}>页边距窄</button>
          </RibbonGroup>
        ) : null}
        {tab === "引用" ? <span className="read-meta">目录、脚注和交叉引用留在后续版本。当前可用「样式」里的标题标出章节。</span> : null}
        {tab === "审阅" ? <span className="read-meta">右侧意见可定位原文。采纳后写入正文，快速访问栏里的撤销可以退回。</span> : null}
        {tab === "视图" ? (
          <RibbonGroup name="显示">
            <button className="wps-cmd" type="button" onClick={() => setZoom(100)}>100%</button>
            <button className="wps-cmd" type="button" onClick={() => setZoom(80)}>页宽</button>
            <button className="wps-cmd" type="button" onClick={() => setZoom((value) => Math.min(160, value + 10))}>放大</button>
            <button className="wps-cmd" type="button" onClick={() => setZoom((value) => Math.max(60, value - 10))}>缩小</button>
          </RibbonGroup>
        ) : null}
      </div>
      {stale ? <div className="quote on">正文已修改。请重新预审，避免用旧意见改到新正文。</div> : null}
      <div className="doc-sheet-wrap">
        {mini ? (
          <div className="wps-mini" style={{ top: mini.top, left: mini.left }} onMouseDown={(event) => { usingTools.current = true; event.preventDefault(); }}>
            <button type="button" onClick={() => command("bold")}><b>B</b></button>
            <button type="button" onClick={() => command("italic")}><i>I</i></button>
            <button type="button" onClick={() => command("underline")}><u>U</u></button>
            <button type="button" onClick={() => command("foreColor", "#b91c1c")}>红</button>
            <button type="button" onClick={() => command("justifyCenter")}>居中</button>
          </div>
        ) : null}
        {word ? <div className="wps-ruler" aria-hidden="true" /> : null}
        <div
          ref={sheet}
          className={`doc-sheet${brushOn ? " painting" : ""}`}
          contentEditable
          suppressContentEditableWarning
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
          onInput={() => { remember(); sync(); onEdit(); }}
          onMouseUp={placeMini}
          onKeyUp={placeMini}
        />
      </div>
      <div className="doc-status">
        <span>{word ? "页面视图" : "纯文本"}</span>
        <span>{words} 字</span>
        <span>{status}</span>
        <span>A4</span>
        <span>{zoom}%</span>
      </div>
    </section>
  );
});
