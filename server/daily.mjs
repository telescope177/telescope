import { fetchPublic } from "./fetch.mjs";

const LIST = "https://www.gov.cn/yaowen/liebiao/YAOWENLIEBIAO.json";

function shanghaiDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function today() {
  return shanghaiDay();
}

export function yesterday() {
  return previousDay(shanghaiDay());
}

export function previousDay(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export async function listPublications(limit = 20) {
  const fetched = await fetchPublic(LIST);
  const parsed = JSON.parse(fetched.body.toString("utf8"));
  return (Array.isArray(parsed) ? parsed : [])
    .map((item) => ({
      ok: true,
      id: "",
      title: String(item?.TITLE || "").replace(/\s+/g, " ").trim(),
      publishedAt: String(item?.DOCRELPUBTIME || ""),
      publisher: "中国政府网",
      infoKind: "",
      summary: "",
      points: [],
      url: String(item?.URL || ""),
    }))
    .filter((item) => item.title && /^https?:\/\//i.test(item.url) && /^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt))
    .slice(0, limit);
}

export async function publicationDates() {
  const fetched = await fetchPublic(LIST);
  const parsed = JSON.parse(fetched.body.toString("utf8"));
  const dates = new Map();
  for (const item of Array.isArray(parsed) ? parsed : []) {
    const date = String(item?.DOCRELPUBTIME || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const address = String(item?.URL || "");
    const id = address.match(/content_(\d+)/)?.[1];
    if (id) dates.set(id, date);
  }
  return dates;
}

export async function listByDay(day = previousDay(shanghaiDay()), limit = 8) {
  const fetched = await fetchPublic(LIST);
  const parsed = JSON.parse(fetched.body.toString("utf8"));
  const items = (Array.isArray(parsed) ? parsed : [])
    .filter((item) => item && item.DOCRELPUBTIME === day && /^https:\/\/www\.gov\.cn\/.+\.s?htm$/i.test(String(item.URL || "")))
    .slice(0, limit)
    .map((item) => ({
      title: String(item.TITLE || "").trim(),
      url: item.URL,
      publishedAt: item.DOCRELPUBTIME,
    }));
  return { day, items };
}
