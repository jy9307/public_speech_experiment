"use client";
import { useEffect, useState } from "react";

export default function PreparationTimer({ roundId }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const key = `speech-preparation:v1:${roundId}`;
    let elapsed = 0, last = performance.now();
    try {
      const saved = Number(localStorage.getItem(key));
      if (Number.isFinite(saved) && saved >= 0) elapsed = saved;
    } catch {}
    const tick = () => {
      const now = performance.now();
      elapsed += Math.max(0, now - last);
      last = now;
      setSeconds(Math.floor(elapsed / 1000));
    };
    const save = () => { tick(); try { localStorage.setItem(key, String(elapsed)); } catch {} };
    const visibility = () => { save(); };
    tick();
    const timer = setInterval(save, 1000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", save);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [roundId]);
  return <div className="preparation-timer"><span>준비 경과 시간</span><time aria-label="발표 준비 경과 시간">{String(Math.floor(seconds/60)).padStart(2,"0")}:{String(seconds%60).padStart(2,"0")}</time></div>;
}
