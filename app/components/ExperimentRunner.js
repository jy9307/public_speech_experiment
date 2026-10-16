"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import FeedbackWorkspace from "./FeedbackWorkspace";
import Recorder from "./Recorder";
import AnalysisReview from "./AnalysisReview";
import SpeakingMaterials from "./SpeakingMaterials";
import PreparationTimer from "./PreparationTimer";
import { POST_SURVEY_URL } from "../lib/surveys";
import { RUBRIC_CATEGORIES } from "../lib/rubric";
import { useTelemetry } from "../lib/useTelemetry";
const areaNames = Object.fromEntries(
  RUBRIC_CATEGORIES.map((c) => [c.id, c.label]),
);
export default function ExperimentRunner({ participant, materials }) {
  const [study, setStudy] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [recordingActive, setRecordingActive] = useState(false),
    [reviewRoundId, setReviewRoundId] = useState(null),
    [localVideo, setLocalVideo] = useState(null);
  const mounted = useRef(true);
  useEffect(() => () => {
    if (localVideo) URL.revokeObjectURL(localVideo.url);
  }, [localVideo]);
  useEffect(() => {
    if (localVideo && (study?.finished || study?.round.id !== localVideo.roundId)) setLocalVideo(null);
  }, [study?.round.id, study?.finished, localVideo]);
  const screen = reviewRoundId
    ? "analyzing"
    : recordingActive
      ? "recording"
      : study?.finished
        ? "completed"
        : study?.round.state === "analysis_failed"
          ? "analyzing"
          : study?.round.state === "recording"
            ? "ready"
            : study?.round.state || "ready";
  const telemetry = useTelemetry(participant.id, study?.round.id, screen);
  const reload = useCallback(async () => {
    const r = await fetch("/api/study");
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    if (mounted.current) {
      setStudy(d);
      if (!d.finished && (["analyzing", "analysis_failed"].includes(d.round.state) || (d.round.number === 5 && d.round.state === "completed")))
        setReviewRoundId(d.round.id);
    }
    return d;
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (telemetry.ready) {
      (async () => {
        if (!(await telemetry.flush()))
          throw new Error(
            "이전 작성 기록을 서버에 저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.",
          );
        await reload();
      })().catch((e) => setError(e.message));
    }
    return () => {
      mounted.current = false;
    };
  }, [reload, telemetry.ready, telemetry.flush]);
  useEffect(() => {
    if (study?.finished || (study?.round.state !== "analyzing" && !(reviewRoundId && study?.round.state === "recording"))) return;
    const interval = setInterval(() => {
      reload().catch((e) => setError(e.message));
    }, 3000);
    return () => clearInterval(interval);
  }, [study?.round.state, study?.finished, reviewRoundId, reload]);
  async function transition(action) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      if (!(await telemetry.flush()))
        throw new Error(
          "작성 내용을 저장하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
        );
      const response = await fetch("/api/study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId: study.round.id, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setStudy(data);
      if (action === "finish") setReviewRoundId(null);
      if (action === "start") setRecordingActive(true);
      window.scrollTo({ top: 0, behavior: "instant" });
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!study)
    return (
      <main className="loading-screen">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button onClick={() => reload().catch((e) => setError(e.message))}>
              다시 시도
            </button>
          </>
        ) : (
          "불러오는 중…"
        )}
      </main>
    );
  const round = study.round;
  const videoSrc = localVideo?.roundId === round.id ? localVideo.url : `/api/recording/${round.id}`;
  return (
    <div onClickCapture={telemetry.click}>
      {(reviewRoundId || !["sense", "plan"].includes(round.state)) &&
        !recordingActive && (
          <header className="study-header">
            <strong>발표 연습 {round.number} / 5</strong>
            <span>
              {participant.id}
              {participant.isTest ? " (테스트)" : ""}
            </span>
            <form
              action="/api/session"
              method="post"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await telemetry.flush()) e.target.submit();
              }}
            >
              <input type="hidden" name="logout" value="true" />
              <button type="submit" className="btn-outline">
                나가기
              </button>
            </form>
          </header>
        )}
      {!study.finished && (reviewRoundId || ["analyzing", "analysis_failed"].includes(round.state)) ? (
        <AnalysisReview
          round={round}
          videoSrc={videoSrc}
          busy={busy}
          onRetry={() => transition("retry")}
          telemetry={telemetry}
          onContinue={() => round.number === 5 ? transition("finish") : setReviewRoundId(null)}
        />
      ) : study.finished ? (
        <main className="study-complete">
          <h1>5회의 발표를 모두 마쳤습니다.</h1>
          <p>
            발표 영상과 활동 응답이 저장되었습니다. 마지막으로 사후 설문에 참여해 주세요.
          </p>
          <a className="survey-link" href={POST_SURVEY_URL} target="_blank" rel="noopener noreferrer">사후 설문 참여하기 <span>새 창에서 열기 ↗</span></a>
        </main>
      ) : ["ready", "recording"].includes(round.state) ? (
        <main className={recordingActive ? "" : "study-preparation"}>
          {!recordingActive && <><div className="preparation-heading"><h1>{round.number}번째 발표 준비</h1><PreparationTimer key={round.id} roundId={round.id}/></div><section className="study-instructions" aria-label="실험 진행 안내">
            <p>총 5회 발표합니다. 1~4회차는 발표 → 영상 검토와 피드백 이해 → 행동계획 작성 순서로 진행합니다. 5회차는 발표 영상을 전송한 후 활동을 마칩니다.</p>
            <p>아래 지문을 읽고 발표를 준비해 주세요. 2회차부터는 직전 행동계획도 함께 확인하세요. 카메라와 마이크를 점검한 뒤 ‘발표 녹화 시작’을 누르면 녹화됩니다.</p>
          </section></>}
          <div className={recordingActive ? "" : "preparation-grid"}>
          {!recordingActive && <SpeakingMaterials materials={materials}/>}
          <div className={recordingActive ? "" : "preparation-side"}>
          {!recordingActive && study.previousPlan.length > 0 && (
            <section className="previous-plan">
              <h2>{round.number - 1}번째 발표 후 작성한 나의 행동계획</h2>
              {["content", "organization", "expression"]
                .map((area) => (
                  <article key={area}>
                    <h3>{areaNames[area]}</h3>
                    <p>
                      <strong>목표</strong>{" "}
                      {
                        study.previousPlan.find(
                          (p) => p.area === area && p.field === "goal",
                        )?.value
                      }
                    </p>
                    <p>
                      <strong>실천 계획</strong>{" "}
                      {
                        study.previousPlan.find(
                          (p) => p.area === area && p.field === "strategy",
                        )?.value
                      }
                    </p>
                  </article>
                ))}
            </section>
          )}
          <Recorder
            key={round.id}
            round={round}
            onStart={() => transition("start")}
            onUploaded={async (blob) => {
              setLocalVideo({ roundId: round.id, url: URL.createObjectURL(blob) });
              setReviewRoundId(round.id);
              setRecordingActive(false);
              await reload().catch((e)=>setError(e.message));
            }}
            telemetry={telemetry}
          />
          </div>
          </div>
        </main>
      ) : (
        <FeedbackWorkspace
          key={round.id}
          participant={participant}
          study={study}
          videoSrc={videoSrc}
          telemetry={telemetry}
          onTransition={transition}
          busy={busy}
        />
      )}
      {(error || telemetry.error) && (
        <p className="study-error" role="alert">
          {error || telemetry.error}
        </p>
      )}
    </div>
  );
}
