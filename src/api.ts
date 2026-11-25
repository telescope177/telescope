const TOKEN = "gov-demo-token";

export function authHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  const token = sessionStorage.getItem(TOKEN) || "";
  if (token) headers.set("authorization", `Bearer ${token}`);
  return headers;
}

export function saveToken(token: string) {
  sessionStorage.setItem(TOKEN, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN);
}

export async function api(path: string, init: RequestInit = {}) {
  const headers = authHeaders(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  if (!text.trim()) throw new Error("咨询接口未连接");
  const body = JSON.parse(text) as { ok?: boolean; error?: string; [key: string]: unknown };
  if (!response.ok || body.ok === false) throw new Error(body.error || "请求失败");
  return body;
}
