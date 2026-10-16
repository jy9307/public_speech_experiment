'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function LoginForm() {
  const [id, setId] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const router = useRouter();
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      router.push(data.path); router.refresh();
    } catch (err) { setError(err.message || '접속하지 못했습니다. 다시 시도해 주세요.'); setBusy(false); }
  }
  return <form onSubmit={submit} className="login-form"><label htmlFor="participant-id">참여자 아이디</label><input id="participant-id" name="participantId" value={id} onChange={e => setId(e.target.value)} placeholder="아이디를 입력하세요" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={40} required aria-describedby={error ? 'login-error' : undefined} aria-invalid={!!error} disabled={busy} />{error && <p id="login-error" role="alert" className="form-error">{error}</p>}<button type="submit" disabled={busy || !id.trim()}>{busy ? '입장하고 있습니다…' : '시작하기'} <span aria-hidden="true">→</span></button></form>;
}
