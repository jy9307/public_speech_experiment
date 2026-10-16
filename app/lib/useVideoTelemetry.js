"use client";
import { useEffect, useRef } from "react";
export function useVideoTelemetry(telemetry, roundId, source) {
  const active = useRef(null), lastProgress = useRef(0), element = useRef(null);
  const emit = telemetry?.emit;
  const screen = source === "analysis_review" ? "analyzing" : source === "before_upload" ? "recording" : source;
  function log(type, payload) { emit?.(type, payload, null, {roundId,screen}); }
  function position(video) {
    return { source, seconds: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video.duration) ? video.duration : null };
  }
  function stop(video) {
    if (active.current === null) return;
    const now = performance.now();
    log("video_review_end", { ...position(video), durationMs: Math.max(0,Math.round(now-active.current)), measurement:"visible_playback" });
    active.current = null;
  }
  function start(video) {
    element.current = video;
    if (document.visibilityState === "visible" && !video.paused && !video.seeking && active.current === null) active.current = performance.now();
  }
  useEffect(() => {
    const hide = () => { if(element.current) {stop(element.current);start(element.current);} };
    if(element.current)start(element.current);
    document.addEventListener("visibilitychange",hide);
    const timer = setInterval(() => {
      if(element.current && active.current !== null) {stop(element.current);start(element.current);}
    },15000);
    return () => {
      clearInterval(timer);document.removeEventListener("visibilitychange",hide);
      if(element.current)stop(element.current);
    };
  }, [roundId, source, emit]);
  return {
    onPlay(e) {start(e.currentTarget);log("video_play",position(e.currentTarget));},
    onPause(e) {stop(e.currentTarget);log("video_pause",position(e.currentTarget));},
    onSeeking(e) {stop(e.currentTarget);},
    onSeeked(e) {log("video_seek",position(e.currentTarget));start(e.currentTarget);},
    onEnded(e) {stop(e.currentTarget);log("video_end",position(e.currentTarget));},
    onWaiting(e) {stop(e.currentTarget);},
    onPlaying(e) {start(e.currentTarget);},
    onTimeUpdate(e) {
      if(performance.now()-lastProgress.current > 15000) {
        lastProgress.current=performance.now();log("video_progress",position(e.currentTarget));
      }
    },
  };
}
