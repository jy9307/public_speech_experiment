'use client';
import { useEffect, useRef, useState } from 'react';
export default function ChatPanel({ participantId, feedbackId, context }) {
  const [messages, setMessages] = useState([]); const [input, setInput] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [ready, setReady] = useState(false); const endRef = useRef(null);
  const key = `speech-chat:v3:${participantId}:${feedbackId}`;
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(saved)) setMessages(saved.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')); } catch { setError('이전 대화를 불러오지 못했습니다.'); } setReady(true); }, [key]);
  useEffect(() => { if (!ready) return; try { localStorage.setItem(key, JSON.stringify(messages)); } catch { setError('대화를 브라우저에 저장하지 못했습니다.'); } }, [messages, ready, key]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [messages, busy]);
  async function submit(event) {
    event.preventDefault(); const message = input.trim(); if (!message || busy) return;
    setBusy(true); setError(''); setInput(''); setMessages(current => [...current, { role: 'user', content: message }]);
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(55000), body: JSON.stringify({ message, history: messages.slice(-20), context }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      const updated = [...messages, { role: 'user', content: message }, { role: 'assistant', content: data.response }];
      try { localStorage.setItem(key, JSON.stringify(updated)); } catch { /* The mounted component reports storage errors. */ }
      setMessages(updated);
    } catch (err) { try { localStorage.setItem(key, JSON.stringify(messages)); } catch { /* The mounted component reports storage errors. */ } setMessages(messages); setInput(message); setError(err.name === 'TimeoutError' ? '응답 시간이 길어지고 있습니다. 다시 시도해 주세요.' : err.message || '연결을 확인하고 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  return <aside className="chat-panel" aria-label="AI 대화"><header><div className="chat-avatar" aria-hidden="true">✦</div><div><h2>AI 대화 도우미</h2><p>생각을 정리하고 계획을 구체화해 보세요.</p></div></header><div className="chat-context"><span>함께 살펴보는 피드백</span><strong>{context.feedback.title}</strong></div><div className="chat-messages" role="log" aria-label="대화 내역" aria-live="polite"><div className="chat-bubble assistant">{context.stage === 1 ? '이 피드백을 어떻게 이해하셨나요? 자신의 해석이나 궁금한 점을 이야기해 주세요.' : '앞에서 해석한 내용을 바탕으로 다음 발표에서 무엇을 바꾸고 싶으신가요?'}</div>{messages.map((m, i) => <div className={`chat-bubble ${m.role}`} key={i}><span className="sr-only">{m.role === 'user' ? '나' : 'AI'}: </span>{m.content}</div>)}{busy && <p className="chat-pending" role="status">답변을 생각하고 있습니다…</p>}<div ref={endRef} /></div>{error && <p className="chat-error" role="alert">{error}</p>}<form onSubmit={submit} className="chat-form"><label htmlFor="chat-input" className="sr-only">AI에게 보낼 메시지</label><textarea id="chat-input" value={input} onChange={e => setInput(e.target.value)} rows={3} maxLength={2000} placeholder="궁금한 점을 적어 주세요" disabled={busy || !ready} /><div><span>AI의 답변을 검토하며 활용해 주세요.</span><button type="submit" disabled={busy || !ready || !input.trim()} aria-label="메시지 보내기">↑</button></div></form></aside>;
}
