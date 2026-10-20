"use client";
import { useMemo, useState } from "react";

const GROUPS = { control: "통제 집단", experiment: "실험 집단" };
const STATES = { ready: "시작 전", recording: "발표 녹화 중", analyzing: "분석 중", analysis_failed: "분석 확인 필요", sense: "피드백 확인 중", plan: "계획 작성 중", completed: "완료" };
const DATE = new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function AdminDashboard({ participants: initial }) {
  const [participants, setParticipants] = useState(initial);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const visible = useMemo(() => participants.filter((p) => (group === "all" || p.condition === group) && p.id.toLowerCase().includes(query.trim().toLowerCase())), [participants, group, query]);
  const done = participants.filter((p) => p.completed_at).length;
  const speaking = participants.filter((p) => ["recording", "analyzing", "sense", "plan"].includes(p.current_state)).length;
  async function remove(p) {
    const confirmed = window.prompt(`참가자 ${p.id}의 발표 영상과 모든 응답 데이터를 삭제합니다. 계속하려면 아이디를 입력하세요.`);
    if (confirmed !== p.id) return;
    setBusyId(p.id); setNotice("");
    try {
      const response = await fetch(`/api/admin/participants/${encodeURIComponent(p.id)}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "삭제하지 못했습니다.");
      setParticipants((current) => current.filter((item) => item.id !== p.id)); setNotice(`${p.id} 참가자 데이터가 삭제되었습니다.`);
    } catch (error) { setNotice(error.message); }
    finally { setBusyId(""); }
  }
  async function logout() { await fetch("/api/admin/session", { method: "DELETE" }); window.location.reload(); }
  return <main className="admin-shell">
    <header className="admin-topbar"><a className="admin-wordmark" href="/admin"><span>S</span><b>발표 실험</b><i>관리자</i></a><button className="admin-quiet-button" onClick={logout}>로그아웃</button></header>
    <section className="admin-content">
      <div className="admin-title-row"><div><div className="admin-kicker">STUDY OVERVIEW</div><h1>참가자 현황</h1><p>발표 진행 상태와 집단별 참여 현황을 관리합니다.</p></div><div className="admin-live"><span /> 데이터 실시간 조회</div></div>
      <div className="admin-metrics">
        <article><span>등록된 발표자</span><strong>{participants.length}<small>명</small></strong><em>전체 참여자</em></article>
        <article><span>진행 중</span><strong>{speaking}<small>명</small></strong><em>현재 실험 진행 중</em></article>
        <article><span>실험 완료</span><strong>{done}<small>명</small></strong><em>전체 과정 완료</em></article>
        <article><span>집단 구성</span><strong>{participants.filter((p) => p.condition === "control").length}<small> : </small>{participants.filter((p) => p.condition === "experiment").length}</strong><em>통제 집단 : 실험 집단</em></article>
      </div>
      <section className="admin-panel">
        <div className="admin-panel-heading"><div><h2>참여자 목록</h2><p>최근 활동 순으로 표시합니다.</p></div><span className="admin-count">{visible.length}명</span></div>
        <div className="admin-filters"><label className="admin-search"><span aria-hidden="true">⌕</span><input aria-label="참가자 아이디 검색" placeholder="아이디 검색" value={query} onChange={(e) => setQuery(e.target.value)} /></label><div className="admin-tabs" aria-label="집단 필터"><button className={group === "all" ? "active" : ""} onClick={() => setGroup("all")}>전체</button><button className={group === "control" ? "active" : ""} onClick={() => setGroup("control")}>통제 집단</button><button className={group === "experiment" ? "active" : ""} onClick={() => setGroup("experiment")}>실험 집단</button></div></div>
        {notice && <div className="admin-notice" role="status">{notice}</div>}
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>참가자</th><th>집단</th><th>진행 상황</th><th>발표 회차</th><th>영상</th><th>최근 활동</th><th><span className="sr-only">관리</span></th></tr></thead><tbody>
          {visible.map((p) => <tr key={p.id}><td><strong className="admin-participant-id">{p.id}</strong>{p.is_test && <span className="admin-test-tag">테스트</span>}</td><td><span className={`admin-group-tag ${p.condition}`}>{GROUPS[p.condition]}</span></td><td><span className={`admin-state ${p.current_state === "completed" ? "done" : ""}`}><i />{STATES[p.current_state] || "참여 전"}</span></td><td><strong>{p.current_round || 0}</strong><span className="admin-muted"> / 5회</span><div className="admin-progress"><i style={{ width: `${Math.min(100, (p.completed_rounds / 5) * 100)}%` }} /></div></td><td>{p.recording_count}<span className="admin-muted">개</span></td><td>{p.activity_at ? DATE.format(new Date(p.activity_at)) : "—"}</td><td><button className="admin-delete" disabled={busyId === p.id} onClick={() => remove(p)}>{busyId === p.id ? "삭제 중…" : "데이터 삭제"}</button></td></tr>)}
          {!visible.length && <tr><td colSpan="7" className="admin-empty">{participants.length ? "검색 결과가 없습니다." : "아직 참여한 발표자가 없습니다."}</td></tr>}
        </tbody></table></div>
        <div className="admin-footnote"><span>ⓘ</span> 데이터 삭제 시 발표 영상, 피드백, 응답 기록이 함께 영구 삭제됩니다. 집단 배정은 유지됩니다.</div>
      </section>
      <footer className="admin-footer">발표 피드백 실험 <span>연구 데이터 관리</span></footer>
    </section>
  </main>;
}
