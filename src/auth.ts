export type Role = "系统管理员" | "安全保密管理员" | "安全审计员" | "管理员" | "主管" | "用户";
export type Level = "三员" | "一级" | "二级" | "三级";
export type PageId = "intake" | "search" | "draft" | "review" | "analysis" | "consult" | "admin";
export type Action =
  | "intake"
  | "archive"
  | "search"
  | "draft"
  | "review"
  | "analysis"
  | "consult"
  | "consultSave"
  | "siteRemove"
  | "model"
  | "basis"
  | "grant"
  | "audit";

export interface Account {
  username: string;
  password: string;
  role: Role;
  level: Level;
  duty: string;
}

export const BUSINESS_ACTIONS: Action[] = ["intake", "archive", "search", "draft", "review", "analysis", "consult", "consultSave", "siteRemove"];
export const ACTION_LABEL: Record<Action, string> = {
  intake: "资料归集",
  archive: "归档入库",
  search: "依据检索",
  draft: "文稿预审",
  review: "审核决定",
  analysis: "办件分析",
  consult: "网络咨询",
  consultSave: "咨询入库",
  siteRemove: "删除网址",
  model: "配置大模型",
  basis: "配置审核依据",
  grant: "分配权限",
  audit: "查看审计",
};

const STAFF: Record<string, Action[]> = {
  系统管理员: ["model", "basis"],
  安全保密管理员: ["grant"],
  安全审计员: ["audit"],
};

export const DEFAULT_GRANTS: Record<string, Action[]> = {
  管理员: ["intake", "archive", "search", "draft", "review", "analysis", "consult", "consultSave", "siteRemove"],
  主管: ["search", "draft", "review", "analysis", "consult"],
  用户: ["search", "draft", "analysis", "consult"],
};

const PAGE_ACTIONS: Record<PageId, Action[]> = {
  intake: ["intake", "archive"],
  search: ["search"],
  draft: ["draft"],
  review: ["review"],
  analysis: ["analysis"],
  consult: ["consult", "consultSave", "siteRemove"],
  admin: ["model", "basis", "grant", "audit"],
};

export const ACCOUNTS: Account[] = [
  { username: "sysadmin", password: "123456", role: "系统管理员", level: "三员", duty: "配置大模型和审核依据。不能分配权限，不能看审计日志。" },
  { username: "secadmin", password: "123456", role: "安全保密管理员", level: "三员", duty: "给业务角色勾选操作权限。不能改模型或依据。" },
  { username: "auditor", password: "123456", role: "安全审计员", level: "三员", duty: "只查看登录、配置和业务操作日志。" },
  { username: "admin", password: "123456", role: "管理员", level: "一级", duty: "资料归集、入库、检索、预审、审核决定、办件分析和网络咨询。" },
  { username: "manager", password: "123456", role: "主管", level: "二级", duty: "审核决定、检索、预审、分析和咨询抓取。不能归集，不能入库或删除网址。" },
  { username: "user", password: "123456", role: "用户", level: "三级", duty: "检索、预审、办件核对和咨询抓取。不能审核决定，不能入库或删除网址。" },
];

export function findAccount(username: string | null) {
  if (!username) return null;
  return ACCOUNTS.find((item) => item.username === username) ?? null;
}

export function actionsFor(role: Role | string, grants?: Record<string, Action[]> | null) {
  if (STAFF[role]) return STAFF[role];
  return grants?.[role] ?? DEFAULT_GRANTS[role] ?? [];
}

export function allows(role: Role | string, action: Action, grants?: Record<string, Action[]> | null) {
  return actionsFor(role, grants).includes(action);
}

const order: PageId[] = ["admin", "intake", "search", "draft", "review", "analysis", "consult"];

export function canOpen(username: string | null, page: PageId, grants?: Record<string, Action[]> | null) {
  const account = findAccount(username);
  if (!account) return false;
  const owned = actionsFor(account.role, grants);
  return PAGE_ACTIONS[page].some((action) => owned.includes(action));
}

export function firstPage(username: string | null, grants?: Record<string, Action[]> | null): PageId {
  return order.find((page) => canOpen(username, page, grants)) ?? "search";
}
