"use client";
import { useEffect, useRef, useState } from "react";
export default function ChatPanel({ roundId, context, telemetry }) {
  const [messages, setMessages] = useState([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  const messagesRef = useRef(null),
    activeSince = useRef(null),
    lastInteraction = useRef(0),
    pendingQuestion = useRef(null);
  const area = context.feedback.categoryId;
  const chatScreen = context.stage;
  function log(type, payload) {telemetry.emit(type,payload,null,{roundId,screen:chatScreen});}
  const draftKey = `speech-chat-draft:v1:${roundId}:${area}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (saved) { setInput(saved.input || ""); pendingQuestion.current = saved.pending || null; }
    } catch { setError("질문 초안을 복구하지 못했습니다."); }
  }, [draftKey]);
  function saveDraft(value, pending = pendingQuestion.current) {
    try { localStorage.setItem(draftKey, JSON.stringify({input:value,pending})); }
    catch { setError("질문 초안을 임시 저장하지 못했습니다. 창을 닫지 말아 주세요."); }
  }
  useEffect(() => {
    let alive = true;
    fetch(`/api/chat?roundId=${roundId}&area=${area}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        if (alive) {
          setMessages(d.messages);
          setReady(true);
        }
      })
      .catch(() => {
        if (alive)
          setError("대화를 불러오지 못했습니다. 화면을 새로고침해 주세요.");
      });
    return () => {
      alive = false;
    };
  }, [roundId, area]);
  function segment(end = false) {
    if (activeSince.current === null) return;
    const now = performance.now();
    log("chat_end", {
      durationMs: Math.max(0, Math.min(30000, Math.round(Math.min(now,lastInteraction.current+60000) - activeSince.current))),
      measurement: "visible_interaction_session_idle_60s",
      area,
    });
    activeSince.current = end ? null : now;
  }
  function start() {
    lastInteraction.current = performance.now();
    if (activeSince.current !== null) return;
    activeSince.current = performance.now();
    log("chat_start", { area });
  }
  useEffect(() => {
    const interval = setInterval(
      () => segment(performance.now() - lastInteraction.current > 60000),
      15000,
    );
    const outside = (e) => {
      if (!e.target.closest(".chat-panel")) segment(true);
    };
    document.addEventListener("pointerdown", outside);
    const hide = () => {
      if (document.visibilityState === "hidden") segment(true);
    };
    const unload = () => segment(true);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", unload);
    return () => {
      document.removeEventListener("pointerdown", outside);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", unload);
      segment(true);
    };
  }, [area, chatScreen]);
  useEffect(() => {
    if (messagesRef.current)
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, busy]);
  async function submit(event) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setBusy(true);
    setError("");
    start();
    try {
      if (!(await telemetry.flush()))
        throw new Error("작성 내용을 저장한 뒤 다시 시도해 주세요.");
      if (!pendingQuestion.current || pendingQuestion.current.message !== message) {
        pendingQuestion.current = {requestId:crypto.randomUUID(),message,clientAt:new Date().toISOString(),questionId:context.activeQuestion.id};
      }
      const question = pendingQuestion.current;
      const clientAt = question.clientAt;
      saveDraft(input);
      log("chat_question_sent",{area,requestId:question.requestId});
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(55000),
        body: JSON.stringify({
          roundId,
          area,
          message,
          questionId: question.questionId,
          requestId: question.requestId,
          clientAt,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      log("chat_answer_received",{area,requestId:question.requestId,answerId:data.id});
      setMessages((current) => [
        ...current.filter((m)=>m.id !== data.questionId && m.id !== data.id),
        {
          id: data.questionId,
          role: "user",
          content: message,
          client_at: clientAt,
        },
        {
          id: data.id,
          role: "assistant",
          content: data.response,
          client_at: data.at,
        },
      ]);
      pendingQuestion.current=null;
      setInput("");
      saveDraft("",null);
    } catch (err) {
      setError(
        err.name === "TimeoutError"
          ? "응답 시간이 길어지고 있습니다. 잠시 후 다시 시도해 주세요."
          : err.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside
      className="chat-panel"
      aria-label="AI 대화"
      onFocusCapture={start}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) segment(true);
      }}
      onPointerDown={start}
      onPointerMove={start}
      onScrollCapture={start}
      onKeyDown={start}
    >
      <header>
        <div className="chat-avatar" aria-hidden="true">
          ✦
        </div>
        <div>
          <h2>AI 대화 도우미</h2>
          <p>생각을 정리하고 계획을 구체화해 보세요.</p>
        </div>
      </header>
      <div className="chat-context">
        <span>함께 살펴보는 피드백</span>
        <strong>
          {context.feedback.area}: {context.feedback.title}
        </strong>
        <small>지금 생각할 질문: {context.activeQuestion.title}</small>
      </div>
      <div
        ref={messagesRef}
        className="chat-messages"
        role="log"
        aria-label="대화 내역"
        aria-live="polite"
      >
        <div className="chat-bubble assistant">
          {context.activeQuestion.question}
        </div>
        {messages.map((m) => (
          <div className={`chat-bubble ${m.role}`} key={m.id}>
            <span className="sr-only">{m.role === "user" ? "나" : "AI"}: </span>
            {m.content}
          </div>
        ))}
        {busy && (
          <p className="chat-pending" role="status">
            답변을 생각하고 있습니다…
          </p>
        )}
      </div>
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={submit} className="chat-form">
        <label htmlFor="chat-input" className="sr-only">
          AI에게 보낼 메시지
        </label>
        <textarea
          id="chat-input"
          value={input}
          onChange={(e) => {setInput(e.target.value); if(pendingQuestion.current?.message !== e.target.value.trim())pendingQuestion.current=null; saveDraft(e.target.value);}}
          rows={3}
          maxLength={2000}
          placeholder="궁금한 점을 적어 주세요"
          disabled={busy || !ready}
        />
        <div>
          <span>AI의 답변을 검토하며 활용해 주세요.</span>
          <button
            type="submit"
            disabled={busy || !ready || !input.trim()}
            aria-label="메시지 보내기"
          >
            ↑
          </button>
        </div>
      </form>
    </aside>
  );
}
