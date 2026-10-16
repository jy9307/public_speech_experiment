"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export function useTelemetry(participantId, roundId, screen) {
  const key = `speech-events:v1:${participantId}`;
  const queue = useRef([]);
  const inFlight = useRef(null);
  const context = useRef({ roundId, screen });
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  context.current = { roundId, screen };
  const persist = useCallback(() => {
    setPending(queue.current.length);
    try {
      localStorage.setItem(key, JSON.stringify(queue.current));
    } catch {
      setError(
        "기록을 임시 저장하지 못했습니다. 이 창을 닫지 말고 연구 담당자에게 알려 주세요.",
      );
    }
  }, [key]);
  const emit = useCallback(
    (type, payload = {}, component = null, override) => {
      const c = override || context.current;
      if (!c.roundId) return;
      queue.current.push({
        id: crypto.randomUUID(),
        roundId: c.roundId,
        screen: c.screen,
        type,
        component,
        at: new Date().toISOString(),
        payload,
      });
      persist();
    },
    [persist],
  );
  const flush = useCallback(async () => {
    if (inFlight.current) {
      try {
        await inFlight.current;
      } catch {
        return false;
      }
    }
    if (!queue.current.length) return true;
    const work = async () => {
      while (queue.current.length) {
        const batch = [];
        let bytes = 0;
        for (const item of queue.current.slice(0, 40)) {
          const size = new TextEncoder().encode(JSON.stringify(item)).length;
          if (bytes + size > 450000) break;
          batch.push(item);
          bytes += size;
        }
        const response = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: batch }),
        });
        if (!response.ok)
          throw new Error(
            "기록을 서버에 저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.",
          );
        const ids = new Set(batch.map((e) => e.id));
        queue.current = queue.current.filter((e) => !ids.has(e.id));
        persist();
      }
      setError("");
      return true;
    };
    inFlight.current = work();
    try {
      return await inFlight.current;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      inFlight.current = null;
    }
  }, [persist]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "[]");
      queue.current = Array.isArray(saved) ? saved : [];
    } catch {
      setError("임시 기록을 불러오지 못했습니다.");
    }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => {
      void flush();
    }, 2500);
    void flush();
    return () => clearInterval(interval);
  }, [ready, flush]);
  useEffect(() => {
    if (!ready || !roundId) return;
    const c = { roundId, screen };
    const visitId = crypto.randomUUID();
    let activeMs = 0,
      last = performance.now(),
      left = false,
      wasVisible = document.visibilityState === "visible";
    function tick() {
      const now = performance.now();
      if (wasVisible) activeMs += Math.min(now - last, 20000);
      last = now;
      wasVisible = document.visibilityState === "visible";
    }
    function beat() {
      tick();
      emit("heartbeat", { visitId, activeMs: Math.round(activeMs) }, null, c);
    }
    function leave(reason) {
      if (left) return;
      left = true;
      tick();
      emit(
        "screen_leave",
        { visitId, activeMs: Math.round(activeMs), reason },
        null,
        c,
      );
    }
    function beacon() {
      const batch = [];
      let bytes = 0;
      for (const item of queue.current.slice(0, 40)) {
        const size = new TextEncoder().encode(JSON.stringify(item)).length;
        if (bytes + size > 60000) break;
        batch.push(item);
        bytes += size;
      }
      if (batch.length)
        navigator.sendBeacon(
          "/api/events",
          new Blob([JSON.stringify({ events: batch })], {
            type: "application/json",
          }),
        );
    }
    function hide() {
      tick();
      emit("visibility", { state: document.visibilityState }, null, c);
      beat();
      void flush();
    }
    function pagehide() {
      leave("pagehide");
      if (screen !== "completed")
        emit("interruption", { reason: "pagehide" }, null, c);
      beacon();
    }
    function pageshow(event) {
      if (event.persisted) {
        left = false;
        last = performance.now();
        emit(
          "screen_enter",
          { visitId, activeMs: Math.round(activeMs) },
          null,
          c,
        );
      }
    }
    emit("screen_enter", { visitId, activeMs: 0 }, null, c);
    const interval = setInterval(beat, 15000);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("pageshow", pageshow);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", pageshow);
      leave("navigation");
      void flush();
    };
  }, [ready, roundId, screen, emit, flush]);
  const click = useCallback(
    (event) => {
      const node = event.target.closest(
        "[data-component],[aria-label],button,a,input,textarea,select,summary,video,.sense-feedback,.sense-question,.chat-bubble,.previous-plan article",
      );
      if (!node) return;
      const component =
        node.dataset.component ||
        node.id ||
        node.getAttribute("aria-label") ||
        node.name ||
        node.textContent?.trim().slice(0, 120) ||
        node.tagName.toLowerCase();
      emit("click", { tag: node.tagName.toLowerCase() }, component);
    },
    [emit],
  );
  return { emit, flush, click, pending, error, ready };
}
