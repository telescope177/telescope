import { importDocx } from "./docx";
import { gridText, importXlsx, parseCsv } from "./sheetio";

export type EditMode = "word" | "text" | "sheet" | "data";

export interface OpenedFile {
  mode: EditMode;
  label: string;
  html: string;
  grid: string[][];
  fields: { key: string; value: string }[];
  text: string;
}

function plainHtml(text: string) {
  const rows = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  return (rows.length ? rows : [text || ""]).map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`).join("");
}

function textOf(html: string) {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  return holder.innerText;
}

function asGrid(value: unknown) {
  if (!Array.isArray(value) || !value.length) return null;
  if (value.every((row) => Array.isArray(row))) {
    return value.map((row) => (row as unknown[]).map((cell) => (cell == null ? "" : String(cell))));
  }
  if (value.every((row) => row && typeof row === "object" && !Array.isArray(row))) {
    const keys = [...new Set(value.flatMap((row) => Object.keys(row as object)))];
    return [
      keys,
      ...value.map((row) => keys.map((key) => {
        const cell = (row as Record<string, unknown>)[key];
        return cell == null ? "" : String(cell);
      })),
    ];
  }
  return null;
}

function asFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([, item]) => item && typeof item === "object")) return null;
  return entries.map(([key, item]) => ({ key, value: item == null ? "" : String(item) }));
}

function pack(mode: EditMode, label: string, text: string, extra: Partial<OpenedFile> = {}): OpenedFile {
  return { mode, label, html: "", grid: [[""]], fields: [], text, ...extra };
}

export async function readUpload(file: File): Promise<OpenedFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) {
    const html = await importDocx(await file.arrayBuffer());
    if (!html) throw new Error("这份 docx 没有可读正文");
    return pack("word", "Word 文稿", textOf(html), { html });
  }
  if (name.endsWith(".xlsx")) {
    const grid = await importXlsx(await file.arrayBuffer());
    return pack("sheet", "表格", gridText(grid), { grid });
  }
  if (name.endsWith(".csv")) {
    const grid = parseCsv(await file.text());
    return pack("sheet", "表格", gridText(grid), { grid });
  }
  if (name.endsWith(".json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error("JSON 无法解析");
    }
    const grid = asGrid(parsed);
    if (grid) return pack("sheet", "表格", gridText(grid), { grid });
    const fields = asFields(parsed);
    if (fields) {
      const text = fields.map((item) => `${item.key} ${item.value}`).join("\n");
      return pack("data", "数据", text, { fields });
    }
    const pretty = JSON.stringify(parsed, null, 2);
    return pack("text", "纯文本", pretty, { html: plainHtml(pretty) });
  }
  if (name.endsWith(".xls")) throw new Error("xls 请另存为 xlsx 后再修改");
  if (name.endsWith(".doc")) throw new Error("doc 请另存为 docx 后再修改");
  const text = await file.text();
  if (text.includes("\u0000")) throw new Error("这个格式暂不能修改，请换成 docx、txt、xlsx、csv 或 json");
  return pack("text", "纯文本", text, { html: plainHtml(text) });
}

export function downloadName(name: string, ext: string) {
  const base = name.replace(/\.[^.]+$/, "") || "文稿";
  return `${base}${ext}`;
}
