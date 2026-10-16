"use client";
import { useVideoTelemetry } from "../lib/useVideoTelemetry";
import { useEffect, useState } from "react";
export default function AnalysisReview({ round, busy, onRetry, onContinue, telemetry, videoSrc }) {
  const videoEvents = useVideoTelemetry(telemetry, round.id, "analysis_review");
  const [elapsed, setElapsed] = useState(0);
  const pending = !["sense", "plan", "completed", "analysis_failed"].includes(
      round.state,
    ),
    failed = round.state === "analysis_failed";
  useEffect(() => {
    if (!pending || !round.upload_received_at) return;
    const update = () =>
      setElapsed(
        Math.max(
          0,
          Math.floor(
            (Date.now() - Date.parse(round.upload_received_at)) / 1000,
          ),
        ),
      );
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [pending, round.upload_received_at]);
  return (
    <main className="study-analysis analysis-review">
      <div className="analysis-review-heading">
        <span>{round.number}번째 발표</span>
        <h1>나의 발표 돌아보기</h1>
        <p>
          분석을 기다리는 동안 방금 녹화한 영상을 보며 발표를 검토해 주세요.
        </p>
      </div>
      <video
        {...videoEvents}
        key={round.id}
        src={videoSrc}
        controls
        playsInline
        preload="metadata"
        aria-label="분석 대기 중 나의 발표 영상"
      />
      <div className="analysis-review-status">
        {round.number === 5 && pending && <button type="button" className="sense-primary" disabled={busy} onClick={onContinue}>활동 마치기</button>}
        {failed ? (
          <>
            <p role="alert">{round.analysis_error}</p>
            <button
              type="button"
              className="sense-primary"
              disabled={busy}
              onClick={onRetry}
            >
              저장된 영상 재분석
            </button>
            {round.number === 5 && <button type="button" className="sense-primary" disabled={busy} onClick={onContinue}>활동 마치기</button>}
          </>
        ) : pending ? (
          <>
            <p role="status">
              {round.number === 5
                ? "발표 영상을 분석하고 있습니다."
                : "발표를 분석하고 피드백을 준비하고 있습니다."}
            </p>
            <p>
              예상 대기 시간 약 2분 30초 <span aria-hidden="true">/</span> 경과{" "}
              {Math.floor(elapsed / 60)}분 {elapsed % 60}초
            </p>
            <small>분석 상황에 따라 대기 시간이 달라질 수 있습니다.</small>
          </>
        ) : (
          <>
            <p role="status">
              {round.number === 5
                ? "마지막 발표 분석을 마쳤습니다."
                : "피드백이 준비되었습니다. 영상 검토를 마치면 확인해 주세요."}
            </p>
            <button
              type="button"
              className="sense-primary"
              onClick={onContinue}
            >
              {round.number === 5 ? "활동 마치기" : "피드백 확인하기"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
