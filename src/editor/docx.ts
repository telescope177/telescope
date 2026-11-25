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
    if (name === wanted && compSize > 0) {
      const slice = data.slice(start, start + compSize);
      return method === 0 ? new TextDecoder().decode(slice) : inflate(slice);
    }
    offset = start + compSize;
    if (compSize === 0) break;
  }
  return "";
}

function elementAt(source: string, tag: "p" | "tbl", from: number) {
  const token = `<w:${tag}`;
  let cursor = from;
  while (cursor < source.length) {
    const index = source.indexOf(token, cursor);
    if (index < 0) return -1;
    const next = source[index + token.length];
    if (next === ">" || next === " " || next === "/" || next === "\n" || next === "\t") return index;
    cursor = index + token.length;
  }
  return -1;
}

function blocks(xml: string) {
  const body = xml.match(/<w:body\b[^>]*>([\s\S]*)<\/w:body>/)?.[1] ?? xml;
  const found: { kind: "p" | "tbl"; xml: string }[] = [];
  let cursor = 0;
  while (cursor < body.length) {
    const paragraph = elementAt(body, "p", cursor);
    const table = elementAt(body, "tbl", cursor);
    if (paragraph < 0 && table < 0) break;
    const kind = table >= 0 && (paragraph < 0 || table < paragraph) ? "tbl" : "p";
    const start = kind === "tbl" ? table : paragraph;
    const closer = `</w:${kind}>`;
    let depth = 1;
    cursor = start + kind.length + 3;
    while (depth > 0 && cursor < body.length) {
      const nextOpen = elementAt(body, kind, cursor);
      const nextClose = body.indexOf(closer, cursor);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth += 1;
        cursor = nextOpen + kind.length + 3;
      } else {
        depth -= 1;
        cursor = nextClose + closer.length;
      }
    }
    found.push({ kind, xml: body.slice(start, cursor) });
  }
  return found;
}

function texts(fragment: string) {
  return [...fragment.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((item) => item[1]
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")).join("");
}

function runHtml(paragraph: string) {
  const runs = [...paragraph.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g)];
  if (!runs.length) return xmlEscape(texts(paragraph));
  return runs.map((item) => {
    const run = item[0];
    const text = xmlEscape(texts(run));
    if (!text) return "";
    const bold = /<w:b\b/.test(run);
    const italic = /<w:i\b/.test(run);
    const under = /<w:u\b/.test(run);
    const size = Number(run.match(/<w:sz\b[^>]*w:val="(\d+)"/)?.[1] || 0);
    const font = run.match(/<w:rFonts\b[^>]*w:ascii="([^"]+)"/)?.[1] || "";
    const styles = [
      size ? `font-size:${size / 2}pt` : "",
      font ? `font-family:${font}` : "",
      under ? "text-decoration:underline" : "",
    ].filter(Boolean).join(";");
    let html = text;
    if (bold) html = `<strong>${html}</strong>`;
    if (italic) html = `<em>${html}</em>`;
    return styles ? `<span style="${styles}">${html}</span>` : html;
  }).join("");
}

function paragraphHtml(paragraph: string) {
  const style = paragraph.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/)?.[1] || "";
  const level = paragraph.match(/<w:ilvl\b[^>]*w:val="(\d+)"/)?.[1];
  const inner = runHtml(paragraph) || "<br>";
  if (level != null) return { list: true, level: Number(level), html: inner };
  if (/Heading1|^1$|标题/.test(style)) return { list: false, level: 0, html: `<h1 class="doc-h-title">${inner}</h1>` };
  if (/Heading2|^2$/.test(style)) return { list: false, level: 0, html: `<h2 class="doc-h-main">${inner}</h2>` };
  return { list: false, level: 0, html: `<p>${inner}</p>` };
}

function tableHtml(table: string) {
  const rows = [...table.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((row) => {
    const cells = [...row[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cell) => `<td>${texts(cell[0]) || "<br>"}</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<table><tbody>${rows}</tbody></table>`;
}

export function xmlToHtml(xml: string) {
  const html: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    html.push(`<ol class="doc-ol">${list.join("")}</ol>`);
    list = [];
  };
  for (const block of blocks(xml)) {
    if (block.kind === "tbl") {
      flush();
      html.push(tableHtml(block.xml));
      continue;
    }
    const paragraph = paragraphHtml(block.xml);
    if (paragraph.list) {
      list.push(`<li data-level="${paragraph.level + 1}" style="margin-left:${paragraph.level * 1.5}em">${paragraph.html}</li>`);
    } else {
      flush();
      html.push(paragraph.html);
    }
  }
  flush();
  return html.join("");
}

export async function importDocx(buffer: ArrayBuffer) {
  const xml = await readZipText(buffer, "word/document.xml");
  return xml ? xmlToHtml(xml) : "";
}

function plainRuns(node: HTMLElement) {
  const chunks: string[] = [];
  const walk = (current: Node) => {
    if (current.nodeType === Node.TEXT_NODE) {
      const text = current.textContent || "";
      if (!text) return;
      const parent = current.parentElement;
      const style = parent ? getComputedStyle(parent) : null;
      const bold = style ? Number.parseInt(style.fontWeight, 10) >= 600 || style.fontWeight === "bold" : false;
      const italic = style?.fontStyle === "italic";
      const under = (style?.textDecorationLine || "").includes("underline");
      const size = style?.fontSize || "";
      const family = style?.fontFamily.split(",")[0]?.replace(/["']/g, "") || "";
      const pt = size.endsWith("px") ? Math.round(Number.parseFloat(size) * 0.75 * 2) : size.endsWith("pt") ? Math.round(Number.parseFloat(size) * 2) : 0;
      chunks.push(`<w:r><w:rPr>${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}${under ? `<w:u w:val="single"/>` : ""}${family ? `<w:rFonts w:ascii="${xmlEscape(family)}" w:hAnsi="${xmlEscape(family)}" w:eastAsia="${xmlEscape(family)}"/>` : ""}${pt ? `<w:sz w:val="${pt}"/>` : ""}</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`);
      return;
    }
    current.childNodes.forEach(walk);
  };
  walk(node);
  return chunks.join("") || `<w:r><w:t></w:t></w:r>`;
}

function paragraphXml(node: HTMLElement, numbered = false, level = 0) {
  const style = node.classList.contains("doc-h-title") ? `<w:pStyle w:val="Heading1"/>` : node.classList.contains("doc-h-main") ? `<w:pStyle w:val="Heading2"/>` : "";
  const num = numbered ? `<w:numPr><w:ilvl w:val="${Math.max(0, level - 1)}"/><w:numId w:val="1"/></w:numPr>` : "";
  return `<w:p><w:pPr>${style}${num}</w:pPr>${plainRuns(node)}</w:p>`;
}

export function htmlToDocumentXml(root: ParentNode) {
  const parts: string[] = [];
  const emit = (node: Element) => {
    const name = node.tagName;
    if (name === "OL" || name === "UL") {
      [...node.children].forEach((child) => {
        if (child.tagName === "LI") parts.push(paragraphXml(child as HTMLElement, true, Number((child as HTMLElement).dataset.level || 1)));
      });
      return;
    }
    if (name === "TABLE") {
      const rows = [...node.querySelectorAll("tr")].map((row) => {
        const cells = [...row.children].map((cell) => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${paragraphXml(cell as HTMLElement)}</w:tc>`).join("");
        return `<w:tr>${cells}</w:tr>`;
      }).join("");
      parts.push(`<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${rows}</w:tbl>`);
      return;
    }
    if (node.children.length && [...node.children].every((child) => ["P", "H1", "H2", "OL", "UL", "TABLE", "DIV"].includes(child.tagName))) {
      [...node.children].forEach(emit);
      return;
    }
    parts.push(paragraphXml(node as HTMLElement));
  };
  [...root.children].forEach(emit);
  if (!parts.length) parts.push(`<w:p><w:r><w:t></w:t></w:r></w:p>`);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parts.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
}

function zipStore(files: { name: string; data: Uint8Array }[]) {
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
  return new Blob(parts, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function utf8(value: string) {
  return new TextEncoder().encode(value);
}

export function exportDocx(root: ParentNode) {
  const documentXml = htmlToDocumentXml(root);
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2"/></w:lvl><w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2.%3"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>`;
  return zipStore([
    { name: "[Content_Types].xml", data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`) },
    { name: "_rels/.rels", data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: "word/_rels/document.xml.rels", data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`) },
    { name: "word/document.xml", data: utf8(documentXml) },
    { name: "word/styles.xml", data: utf8(styles) },
    { name: "word/numbering.xml", data: utf8(numbering) },
  ]);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
