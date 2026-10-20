"use client";
import { useEffect, useRef, useState } from "react";

const formatTime = (ms) => {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

export default function PreparationTimer({
  roundId,
  label = "발표 준비 남은 시간",
  durationSeconds = 600,
  onExpire,
  onPauseChange,
}) {
  const [remainingMs, setRemainingMs] = useState(durationSeconds * 1000);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const remaining = useRef(durationSeconds * 1000);
  const pausedRef = useRef(false);
  const fired = useRef(false);
  const inFlight = useRef(false);
  const retryExpired = useRef(() => {});
  const callback = useRef(onExpire);
  callback.current = onExpire;

  useEffect(() => {
    const key = `speech-countdown:v1:${roundId}`;
    let stored;
    try { stored = JSON.parse(localStorage.getItem(key) || "null"); } catch {}
    const elapsedSinceSave = stored?.paused ? 0 : Math.max(0, Date.now() - (stored?.savedAt || Date.now()));
    const initial = stored && Number.isFinite(stored.remainingMs)
      ? Math.max(0, stored.remainingMs - elapsedSinceSave)
      : durationSeconds * 1000;
    remaining.current = initial;
    pausedRef.current = Boolean(stored?.paused);
    setRemainingMs(initial);
    setPaused(pausedRef.current);
    setReady(true);

    const save = () => {
      try {
        localStorage.setItem(key, JSON.stringify({ remainingMs: remaining.current, paused: pausedRef.current, savedAt: Date.now() }));
      } catch {}
    };
    let lastSavedAt = Date.now();
    const tick = () => {
      const now = Date.now();
      if (!pausedRef.current && remaining.current > 0) {
        const elapsed = Math.max(0, now - (tick.last || now));
        remaining.current = Math.max(0, remaining.current - elapsed);
        tick.last = now;
        setRemainingMs(remaining.current);
      } else {
        tick.last = now;
      }
      if (now - lastSavedAt >= 1000 || remaining.current === 0) {
        save();
        lastSavedAt = now;
      }
      if (remaining.current === 0 && !fired.current && !pausedRef.current) {
        fired.current = true;
        void runExpired();
      }
    };
    tick.last = Date.now();
    const interval = setInterval(tick, 250);
    const onVisibility = () => { tick(); save(); lastSavedAt = Date.now(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", save);
    async function runExpired() {
      if (inFlight.current) return;
      inFlight.current = true;
      setFailed(false);
      try {
        const result = await callback.current?.();
        if (result === false) setFailed(true);
      } catch {
        setFailed(true);
      } finally {
        inFlight.current = false;
      }
    }
    retryExpired.current = () => {
      if (inFlight.current) return;
      fired.current = false;
      setFailed(false);
      if (remaining.current === 0) {
        fired.current = true;
        void runExpired();
      }
    };
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", save);
      retryExpired.current = () => {};
      save();
    };
  }, [roundId, durationSeconds]);

  function togglePause() {
    if (!ready || remaining.current <= 0) return;
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    onPauseChange?.(next);
    try {
      localStorage.setItem(`speech-countdown:v1:${roundId}`, JSON.stringify({ remainingMs: remaining.current, paused: next, savedAt: Date.now() }));
    } catch {}
  }

  function retry() {
    retryExpired.current();
  }

  return <div className={`preparation-timer${paused ? " is-paused" : ""}`}>
    <span>{label}</span>
    <time aria-label={`${label}, ${formatTime(remainingMs)} 남음`}>{formatTime(remainingMs)}</time>
    <button type="button" className="timer-pause" aria-pressed={paused} disabled={!ready || remainingMs <= 0} onClick={togglePause}>{paused ? "재개" : "일시정지"}</button>
    {failed && <button type="button" className="timer-retry" onClick={retry}>다음 단계 다시 시도</button>}
  </div>;
}
