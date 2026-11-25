import knowledgeJson from "../data/knowledge.json";
import jobsJson from "../data/jobs.json";
import uploadsJson from "../data/uploads.json";
import draftsJson from "../data/drafts.json";
import issuesJson from "../data/issues.json";
import oaJson from "../data/oa-tasks.json";
import chartJson from "../data/chart-data.json";
import basisJson from "../data/basis-compare.json";

export interface Article {
  no: number;
  text: string;
}
export interface KnowledgeDoc {
  id: string;
  title: string;
  docNo: string;
  category: string;
  ledger: boolean;
  level: string;
  status: string;
  source: string;
  publishedAt: string;
  versionLabel: string;
  summary: string;
  replaces: string | null;
  replacedBy: string | null;
  articles: Article[];
}
export interface JobItem {
  id: string;
  source: string;
  level: string;
  theme: string;
  infoKind: string;
  title: string;
  result: string;
  reason: string;
  duplicateOf?: string;
  at: string;
  article?: { sourceLabel: string; body: string };
}
export interface Indicator {
  id: string;
  name: string;
  street: string;
  period: string;
  value: number;
  unit: string;
  unitStatus: string;
  position: string;
  anchor: string;
  matchesRow: string;
}
export interface UploadSample {
  id: string;
  kind: string;
  filename: string;
  title: string;
  docNo: string | null;
  docNoStatus: string;
  summary: string;
  body: { anchor: string; text: string }[];
  indicators: Indicator[];
}
export interface Issue {
  id: string;
  kind: string;
  version: string;
  anchors: string[];
  title: string;
  detail: string;
  suggestion: string | null;
  clause: { docId: string; articleNo: number; also?: { docId: string; articleNo: number }[] } | null;
}
export interface DraftPart {
  text: string;
  anchor?: string;
}
export interface OaTask {
  id: string;
  node: string;
  draftId: string;
  version: "v1" | "v2";
  initialStatus: string;
  hint: string;
}
export interface LedgerRow {
  id: string;
  street: string;
  period: string;
  value: number;
  unit: string;
  source: string;
  includeInChart: boolean;
  unitStatus?: string;
}
export interface BasisRow {
  item: string;
  previous: string;
  current: string;
  draftV1: string;
}

export const knowledge = knowledgeJson as KnowledgeDoc[];
export const jobs = jobsJson as JobItem[];
export const uploads = uploadsJson as UploadSample[];
export const issues = issuesJson as Issue[];
export const oaTasks = oaJson as OaTask[];
export const chart = chartJson as {
  unit: string;
  source: string;
  rows: LedgerRow[];
  acceptance: { total: number };
};
export const basis = basisJson as BasisRow[];
export const draft = draftsJson as {
  id: string;
  title: string;
  org: string;
  recipient: string;
  versions: {
    v1: { date: string | null; paragraphs: { no: number; parts: DraftPart[] }[] };
    v2: { date: string | null; paragraphs: { no: number; parts: DraftPart[] }[] };
  };
};

export function normNo(value: string) {
  return value.trim().replace(/\s+/g, "").replace(/\[|［|【/g, "〔").replace(/\]|］|】/g, "〕");
}

export function exactSearch(query: string, docs: KnowledgeDoc[] = knowledge) {
  const q = normNo(query);
  if (!q) return [];
  return docs.filter((item) => normNo(item.docNo) === q);
}

export function fuzzySearch(query: string, docs: KnowledgeDoc[] = knowledge) {
  const q = query.trim();
  if (!q) return { recommend: [] as KnowledgeDoc[], related: [] as KnowledgeDoc[] };
  if (/便民|提数据|报送|什么时候|数据/.test(q)) {
    return {
      recommend: docs.filter((item) => item.id === "KB-003" || item.id === "KB-004"),
      related: docs.filter((item) => item.id === "KB-005"),
    };
  }
  return {
    recommend: docs.filter((item) => `${item.title}${item.summary}${item.docNo}`.includes(q)),
    related: [],
  };
}

export function inspect(version: "v1" | "v2") {
  return version === "v1" ? issues : [];
}

export function internalDraft(): KnowledgeDoc {
  const previous = knowledge.find((item) => item.id === "KB-005")!;
  return {
    id: "KB-008",
    title: `内部文稿：${previous.title}（落档）`,
    docNo: "内部-KB-008",
    category: "内部文稿",
    ledger: false,
    level: "本级",
    status: "内部",
    source: "版本切换落入",
    publishedAt: "2026-11-19",
    versionLabel: "内部文稿",
    summary: `由被替代版本 ${previous.id}（${previous.docNo}）落入，不作为对外引用依据。`,
    replaces: null,
    replacedBy: "KB-003",
    articles: [
      { no: 1, text: `本文稿由被替代版本 ${previous.id} 落入，仅供内部留存。` },
      { no: 2, text: previous.articles[1]?.text ?? "" },
    ],
  };
}

export function libraryDocs(archived: boolean) {
  return archived ? [...knowledge, internalDraft()] : knowledge;
}

export function octoberCheck() {
  const jiang = chart.rows.find((row) => row.id === "DATA-04")!;
  const yun = chart.rows.find((row) => row.id === "DATA-08")!;
  return { jiang: jiang.value, yun: yun.value, total: jiang.value + yun.value };
}

export function unitVerdict(row: LedgerRow) {
  return row.unit.trim() ? "通过" : "待补充";
}
