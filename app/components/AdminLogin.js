"use client";
import { useState } from "react";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error || "로그인하지 못했습니다."); }
      window.location.reload();
    } catch (e) { setError(e.message); setBusy(false); }
  }
  return <main className="admin-login-page"><form className="admin-login-card" onSubmit={submit}>
    <span className="admin-kicker">RESEARCH CONSOLE</span><div className="admin-brand-mark">S</div>
    <h1>관리자 로그인</h1><p>연구 데이터 관리 화면입니다.</p>
    <label htmlFor="admin-password">관리자 비밀번호</label><input id="admin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
    {error && <div className="admin-error" role="alert">{error}</div>}
    <button className="admin-primary" disabled={busy}>{busy ? "확인 중…" : "로그인"}<span aria-hidden="true">→</span></button>
  </form></main>;
}
