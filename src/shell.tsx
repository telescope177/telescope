import { canOpen, findAccount, type PageId } from "./auth";
import { useStore } from "./state";

const NAV: { id: PageId; label: string }[] = [
  { id: "admin", label: "系统后台" },
  { id: "intake", label: "资料归集" },
  { id: "search", label: "依据检索" },
  { id: "draft", label: "文稿预审" },
  { id: "review", label: "审核办理" },
  { id: "analysis", label: "办件分析" },
  { id: "consult", label: "网络咨询" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { state, go, logout, reset } = useStore();
  const account = findAccount(state.user);
  const visible = NAV.filter((item) => canOpen(state.user, item.id, state.grants));
  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <div className="logo">政</div>
          <div>
            <b>政务智辅平台</b>
            <small>便民服务数据报送</small>
          </div>
        </div>
        <div className="roles">
          <span>{account?.username}</span>
          <span className="pill">{account?.level} · {account?.role}</span>
        </div>
        <div className="top-meta">
          <button className="ghost" type="button" onClick={logout}>退出登录</button>
          <button className="ghost" type="button" onClick={reset}>重置会话</button>
        </div>
      </header>
      <div className="body">
        <aside className="side">
          {visible.map((item) => (
            <button key={item.id} type="button" className={state.page === item.id ? "nav on" : "nav"} onClick={() => go(item.id)}>
              {item.label}
            </button>
          ))}
        </aside>
        <main className="main">
          <div className="main-scroll">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function Tag({ value }: { value: string }) {
  const map: Record<string, string> = {
    新入库: "ok",
    现行: "ok",
    通过: "ok",
    一致: "ok",
    正常: "ok",
    重复跳过: "muted",
    已替代: "muted",
    失败待重试: "amber",
    被替代: "warn",
    待核: "info",
    待补充: "bad",
    待人工复核: "info",
    待审核: "info",
    待复用: "info",
    待复核: "info",
    已退回: "bad",
    内部: "purple",
    国家政策: "info",
    会议精神: "purple",
    政策解读: "ok",
    通知公告: "amber",
    咨询答复: "warn",
    其他: "muted",
  };
  return <span className={`tag ${map[value] ?? "info"}`}>{value}</span>;
}
