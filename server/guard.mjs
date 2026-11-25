import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const tokens = new Map();

const ACCOUNTS = [
  ["sysadmin", "123456", "系统管理员"],
  ["secadmin", "123456", "安全保密管理员"],
  ["auditor", "123456", "安全审计员"],
  ["admin", "123456", "管理员"],
  ["manager", "123456", "主管"],
  ["user", "123456", "用户"],
];

const STAFF = {
  系统管理员: ["model", "basis"],
  安全保密管理员: ["grant"],
  安全审计员: ["audit"],
};

const BUSINESS_ACTIONS = ["intake", "archive", "search", "draft", "review", "analysis", "consult", "consultSave", "siteRemove"];
const BUSINESS_ROLES = ["管理员", "主管", "用户"];
const KEEP_IDS = ["KB-001", "KB-002", "KB-003", "KB-004", "KB-005", "KB-006", "KB-007", "KB-008"];

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(dataDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

export function grants() {
  const saved = readJson("permissions.json", {});
  const next = {};
  for (const role of BUSINESS_ROLES) {
    const list = Array.isArray(saved[role]) ? saved[role].filter((item) => BUSINESS_ACTIONS.includes(item)) : [];
    next[role] = list;
  }
  return next;
}

export function actionsFor(role) {
  if (STAFF[role]) return STAFF[role];
  return grants()[role] || [];
}

export function allows(role, action) {
  return actionsFor(role).includes(action);
}

export function login(username, password) {
  const found = ACCOUNTS.find((item) => item[0] === username && item[1] === password);
  if (!found) return null;
  const token = randomBytes(24).toString("hex");
  const actor = { username: found[0], role: found[2] };
  tokens.set(token, actor);
  audit(actor, "登录", found[0]);
  return { token, username: actor.username, role: actor.role, grants: grants() };
}

export function actorFrom(req) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return tokens.get(token) || null;
}

export function guard(req, action) {
  const actor = actorFrom(req);
  if (!actor) return { status: 401, body: { ok: false, error: "请先登录" } };
  if (!allows(actor.role, action)) return { status: 403, body: { ok: false, error: "当前账号没有这项权限" } };
  return null;
}

export function audit(actor, event, detail) {
  const rows = readJson("audit.json", []);
  const list = Array.isArray(rows) ? rows : [];
  list.push({
    at: new Date().toISOString(),
    username: actor?.username || "",
    role: actor?.role || "",
    event,
    detail: String(detail || "").slice(0, 200),
  });
  writeJson("audit.json", list.slice(-400));
}

export function auditLog() {
  const rows = readJson("audit.json", []);
  return Array.isArray(rows) ? rows : [];
}

function mask(key) {
  const value = String(key || "");
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

export function modelView() {
  const saved = readJson("model.json", {});
  return {
    base: String(saved.base || ""),
    model: String(saved.model || ""),
    keyHint: mask(saved.key),
    hasKey: Boolean(saved.key),
  };
}

export function saveModel(actor, input) {
  const current = readJson("model.json", {});
  const keyText = String(input.key || "");
  const key = !keyText || keyText.includes("•") ? String(current.key || "") : keyText;
  const next = {
    base: String(input.base || "").trim(),
    model: String(input.model || "").trim(),
    key,
  };
  writeJson("model.json", next);
  audit(actor, "配置大模型", next.model || next.base || "沿用环境变量");
  return modelView();
}

export function basisView() {
  return {
    knowledge: readJson("knowledge.json", []),
    basis: readJson("basis-compare.json", []),
  };
}

export function saveBasis(actor, input) {
  const knowledge = Array.isArray(input.knowledge) ? input.knowledge : null;
  const basis = Array.isArray(input.basis) ? input.basis : null;
  if (!knowledge || !basis) throw new Error("依据格式不正确");
  const ids = new Set(knowledge.map((item) => item && item.id));
  const missing = KEEP_IDS.filter((id) => !ids.has(id));
  if (missing.length) throw new Error(`不能去掉既有依据 ${missing.join("、")}`);
  writeJson("knowledge.json", knowledge);
  writeJson("basis-compare.json", basis);
  audit(actor, "配置审核依据", `${knowledge.length} 篇`);
  return basisView();
}

export function saveGrants(actor, input) {
  const next = {};
  for (const role of BUSINESS_ROLES) {
    const list = Array.isArray(input?.[role]) ? input[role].filter((item) => BUSINESS_ACTIONS.includes(item)) : [];
    next[role] = list;
  }
  writeJson("permissions.json", next);
  audit(actor, "调整权限", BUSINESS_ROLES.map((role) => `${role}${next[role].length}`).join(" "));
  return next;
}
