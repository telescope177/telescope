import { useState } from "react";
import { ACCOUNTS } from "../auth";
import { useStore } from "../state";

export function LoginPage() {
  const { login } = useStore();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("123456");

  return (
    <div className="login">
      <form
        className="login-card"
        onSubmit={(event) => {
          event.preventDefault();
          void login(username, password);
        }}
      >
        <div className="login-brand">
          <div className="logo">政</div>
          <div>
            <b>政务智辅平台</b>
            <small>便民服务数据报送</small>
          </div>
        </div>
        <h1>账号登录</h1>
        <p>三员只进系统后台。业务账号按权限使用归集、审核和咨询，数据在业务账号之间共用。</p>
        <label className="field">
          账号
          <input className="input" value={username} autoComplete="username" onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label className="field">
          密码
          <input className="input" type="password" value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} />
        </label>
        <button className="btn primary" type="submit">登录</button>
        <div className="stack">
          {ACCOUNTS.map((account) => (
            <button
              key={account.username}
              className="quote"
              type="button"
              onClick={() => {
                setUsername(account.username);
                setPassword(account.password);
              }}
            >
              <b>{account.level} {account.username}</b>
              <span className="tag info">{account.role}</span>
              <div>密码 {account.password}</div>
              <div>{account.duty}</div>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
