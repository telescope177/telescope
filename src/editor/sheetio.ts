const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (const byte of data) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function xmlText(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"");
}

async function inflate(slice: Uint8Array) {
  const stream = new Blob([slice.slice()]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

async function readZipText(buffer: ArrayBuffer, wanted: string) {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let offset = 0;
  while (offset + 30 < data.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(data.slice(offset + 30, offset + 30 + nameLen));
    const start = offset + 30 + nameLen + extraLen;
    if (name.replace(/^\//, "") === wanted.replace(/^\//, "") && compSize > 0) {
      const slice = data.slice(start, start + compSize);
      return method === 0 ? new TextDecoder().decode(slice) : inflate(slice);
    }
    offset = start + compSize;
    if (compSize === 0) break;
  }
  return "";
}

function zipStore(files: { name: string; data: Uint8Array }[], type: string) {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length + file.data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, file.data.length, true);
    view.setUint32(22, file.data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(file.data, 30 + name.length);
    locals.push(local);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, file.data.length, true);
    cv.setUint32(24, file.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end].map((item) => {
    const copy = new ArrayBuffer(item.byteLength);
    new Uint8Array(copy).set(item);
    return copy;
  });
  return new Blob(parts, { type });
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === "\"") {
        if (source[i + 1] === "\"") {
          cell += "\"";
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === "\"") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const filled = rows.filter((line) => line.some((item) => item.length > 0));
  return filled.length ? rectangle(filled) : [[""]];
}

export function csvText(rows: string[][]) {
  return rows.map((line) => line.map((cell) => {
    if (/[",\n]/.test(cell)) return `"${cell.replace(/"/g, "\"\"")}"`;
    return cell;
  }).join(",")).join("\n");
}

function colIndex(ref: string) {
  const letters = ref.replace(/\d/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

function colName(index: number) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const mod = (n - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function rectangle(rows: string[][]) {
  const width = rows.reduce((max, line) => Math.max(max, line.length), 1);
  return rows.map((line) => Array.from({ length: width }, (_, index) => line[index] ?? ""));
}

function sharedStrings(xml: string) {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((item) => xmlText(
    [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((text) => text[1]).join(""),
  ));
}

function cellValue(xml: string, strings: string[]) {
  const type = xml.match(/\bt="([^"]+)"/)?.[1] || "";
  if (type === "inlineStr") return xmlText((xml.match(/<t\b[^>]*>([\s\S]*?)<\/t>/) || [])[1] || "");
  const value = xmlText((xml.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || "");
  if (type === "s") return strings[Number(value)] || "";
  return value;
}

function sheetRows(xml: string, strings: string[]) {
  const rows = [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const line: string[] = [];
    for (const cell of row[1].matchAll(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)) {
      const ref = cell[0].match(/\br="([A-Z]+\d+)"/i)?.[1] || "";
      const index = ref ? colIndex(ref) : line.length;
      line[index] = cellValue(cell[0], strings);
    }
    return line.map((item) => item ?? "");
  });
  return rows.length ? rectangle(rows) : [[""]];
}

export async function importXlsx(buffer: ArrayBuffer) {
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  if (head[0] !== 0x50 || head[1] !== 0x4b) throw new Error("这份表格不是 xlsx");
  const rels = await readZipText(buffer, "xl/_rels/workbook.xml.rels");
  const target = rels.match(/Type="[^"]*\/worksheet"[^>]*Target="([^"]+)"/)?.[1]
    || rels.match(/Target="([^"]+)"[^>]*Type="[^"]*\/worksheet"/)?.[1]
    || "worksheets/sheet1.xml";
  const path = target.startsWith("/") ? target.slice(1) : target.startsWith("xl/") ? target : `xl/${target}`;
  const sheet = await readZipText(buffer, path);
  if (!sheet) throw new Error("这份 xlsx 没有可读的工作表");
  const strings = sharedStrings(await readZipText(buffer, "xl/sharedStrings.xml"));
  return sheetRows(sheet, strings);
}

function utf8(value: string) {
  return new TextEncoder().encode(value);
}

export function exportXlsx(rows: string[][]) {
  const body = rows.map((line, rowIndex) => {
    const cells = line.map((cell, col) => `<c r="${colName(col)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
  return zipStore([
    { name: "[Content_Types].xml", data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`) },
    { name: "_rels/.rels", data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`) },
    { name: "xl/worksheets/sheet1.xml", data: utf8(sheet) },
  ], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

export function gridText(rows: string[][]) {
  return rows.map((line) => line.join("\t")).join("\n");
}
