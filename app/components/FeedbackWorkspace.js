"use client";
import { useVideoTelemetry } from "../lib/useVideoTelemetry";
import Image from "next/image";
import { useRef, useState } from "react";
import ChatPanel from "./ChatPanel";
import RubricTooltip from "./RubricTooltip";
import { normalizeFeedback, feedbackText } from "../lib/rubric";
import { FeedbackCategoryIcon } from "./FeedbackAreaIcons";
import { SENSE_FIELDS, PLAN_FIELDS } from "../lib/questions";
const countAnswers = (answers, fields) =>
  fields.filter((f) => answers?.[f.id]?.trim()).length;
function restore(rows, stage, feedback, fields) {
  return Object.fromEntries(
    feedback.map((f) => [
      f.id,
      Object.fromEntries(
        fields.map((field) => [
          field.id,
          rows.find(
            (r) =>
              r.stage === stage &&
              r.area === f.categoryId &&
              r.field === field.id,
          )?.value || "",
        ]),
      ),
    ]),
  );
}
export default function FeedbackWorkspace({
  participant,
  study,
  videoSrc,
  telemetry,
  onTransition,
  busy,
}) {
  const round = study.round,
    feedback = round.feedback.map(normalizeFeedback);
  const videoRef = useRef(null);
  const stage = round.state === "plan" ? 2 : 1;
  const videoEvents = useVideoTelemetry(telemetry, round.id, stage === 1 ? "sense" : "plan");
  const [activeId, setActiveId] = useState(feedback[0].id),
    [focusedField, setFocusedField] = useState(
      stage === 1 ? "comparison" : "goal",
    );
  const [interpretations, setInterpretations] = useState(() =>
    restore(study.responses, "sense", feedback, SENSE_FIELDS),
  );
  const [plans, setPlans] = useState(() =>
    restore(study.responses, "plan", feedback, PLAN_FIELDS),
  );
  const activeFeedback = feedback.find((f) => f.id === activeId) || feedback[0];
  const fields = stage === 1 ? SENSE_FIELDS : PLAN_FIELDS,
    answers = stage === 1 ? interpretations : plans;
  const stageOneReady = feedback.every(
    (f) => countAnswers(interpretations[f.id], SENSE_FIELDS) === 3,
  );
  const plansReady = feedback.every(
    (f) => countAnswers(plans[f.id], PLAN_FIELDS) === 2,
  );
  const allReady = stage === 1 ? stageOneReady : stageOneReady && plansReady;
  const areaCount = countAnswers(answers[activeId], fields);
  const nextFeedback = feedback.find(
    (f) =>
      f.id !== activeId &&
      countAnswers(answers[f.id], fields) < fields.length,
  );
  const activeQuestion = fields.find((f) => f.id === focusedField) || fields[0];
  function selectFeedback(item) {
    setActiveId(item.id);
    setFocusedField(fields[0].id);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = item.seconds;
    }
  }
  async function changeStage(next) {
    if (await onTransition(next === 1 ? "sense" : "plan")) {
      setFocusedField(next === 1 ? "comparison" : "goal");
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }
  function updateAnswer(field, value) {
    const before = answers[activeId][field];
    telemetry.emit("response_edit", {
      area: activeFeedback.categoryId,
      field,
      before,
      after: value,
    });
    (stage === 1 ? setInterpretations : setPlans)((current) => ({
      ...current,
      [activeId]: { ...current[activeId], [field]: value },
    }));
  }
  function keys(event, index) {
    const map = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: feedback.length - 1,
    };
    if (!(event.key in map)) return;
    event.preventDefault();
    const i = (map[event.key] + feedback.length) % feedback.length;
    selectFeedback(feedback[i]);
    event.currentTarget.parentElement
      .querySelectorAll('[role="tab"]')
      [i]?.focus();
  }
  async function next() {
    if (allReady) {
      if (stage === 1) await changeStage(2);
      else await onTransition("next");
    } else if (nextFeedback) {
      selectFeedback(nextFeedback);
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }
  return (
    <main
      className={`sense-workspace ${participant.group === "experiment" ? "has-chat" : ""}`}
    >
      <header className="sense-header">
        <span className="sense-brand">
          <Image src="/logo.png" alt="" width={30} height={30} />
          <span>{round.number} / 5회 발표</span>
        </span>
        <nav aria-label="피드백 활용 단계" className="sense-stages">
          <button
            type="button"
            aria-current={stage === 1 ? "step" : undefined}
            disabled={busy}
            onClick={() => changeStage(1)}
          >
            <span>1</span> 피드백 이해
          </button>
          <i aria-hidden="true">→</i>
          <button
            type="button"
            aria-current={stage === 2 ? "step" : undefined}
            disabled={busy || !stageOneReady}
            onClick={() => changeStage(2)}
          >
            <span>2</span> 행동계획
          </button>
        </nav>
        <div className="header-actions">
          <span>{participant.id}</span>
          <form
            action="/api/session"
            method="post"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await telemetry.flush()) event.target.submit();
            }}
          >
            <input type="hidden" name="logout" value="true" />
            <button className="btn-outline" type="submit">
              나가기
            </button>
          </form>
        </div>
      </header>
      <h1 className="sr-only">
        {stage === 1 ? "피드백을 이해하고 판단하기" : "다음 발표를 계획하기"}
      </h1>
      <div className="sense-body">
        <aside className="e2a-video-panel">
          <div className="e2a-video-frame">
            <video
              {...videoEvents}
              aria-label="나의 발표 녹화 영상"
              ref={videoRef}
              src={videoSrc}
              controls
              preload="metadata"
              playsInline
            />
          </div>
          <div className="e2a-video-caption">
            <div>
              <span>나의 {round.number}번째 발표</span>
              <strong>피드백의 근거 장면을 확인해 주세요.</strong>
            </div>
            <time>{activeFeedback.time}</time>
          </div>
        </aside>
        <section
          className="sense-board"
          aria-label={stage === 1 ? "피드백 해석" : "행동계획 작성"}
        >
          <div className="sense-tabs" role="tablist" aria-label="피드백 영역">
            {feedback.map((f, i) => {
              const count = countAnswers(answers[f.id], fields);
              return (
                <button
                  key={f.id}
                  id={`tab-${f.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeId === f.id}
                  aria-controls="feedback-panel"
                  tabIndex={activeId === f.id ? 0 : -1}
                  onClick={() => selectFeedback(f)}
                  onKeyDown={(e) => keys(e, i)}
                >
                  <FeedbackCategoryIcon categoryId={f.categoryId} />
                  <span>{f.area}</span>
                  <small>
                    {count === fields.length
                      ? "✓ 완료"
                      : `${count}/${fields.length}`}
                  </small>
                </button>
              );
            })}
          </div>
          <div
            id="feedback-panel"
            role="tabpanel"
            aria-labelledby={`tab-${activeId}`}
          >
            <section className="sense-feedback" aria-label="제공된 피드백">
              <div className="sense-feedback-heading">
                <h2>
                  <RubricTooltip
                    telemetry={telemetry}
                    roundId={round.id}
                    screen={stage === 1 ? "sense" : "plan"}
                    categoryId={activeFeedback.categoryId}
                    itemId={activeFeedback.rubricItemId}
                  />
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    selectFeedback(activeFeedback);
                    videoRef.current?.play().catch(() => {});
                  }}
                >
                  ▷ {activeFeedback.time} 장면 보기
                </button>
              </div>
              <p className="feedback-narrative">
                {feedbackText(activeFeedback)}
              </p>
            </section>
            {stage === 2 && (
              <details className="sense-prior" open>
                <summary>앞에서 작성한 나의 해석</summary>
                <dl>
                  {SENSE_FIELDS.map((f) => (
                    <div key={f.id}>
                      <dt>{f.title}</dt>
                      <dd>{interpretations[activeId][f.id]}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            <div className="sense-writing">
              {fields.map((f, i) => (
                <section
                  key={f.id}
                  className={`sense-question ${focusedField === f.id ? "is-focused" : ""}`}
                >
                  <label htmlFor={`answer-${activeId}-${f.id}`}>
                    <span className="sense-question-title">
                      <b>{i + 1}</b>
                      {f.title}
                      {answers[activeId][f.id].trim() && <small>작성됨</small>}
                    </span>
                    <span className="sense-question-copy">{f.question}</span>
                  </label>
                  <textarea
                    id={`answer-${activeId}-${f.id}`}
                    aria-label={`${activeFeedback.area} ${f.title}`}
                    value={answers[activeId][f.id]}
                    onFocus={() => setFocusedField(f.id)}
                    onChange={(e) => updateAnswer(f.id, e.target.value)}
                    placeholder={f.placeholder}
                    rows={3}
                    maxLength={20000}
                  />
                </section>
              ))}
            </div>
          </div>
        </section>
        {participant.group === "experiment" && (
          <ChatPanel
            key={`${round.id}:${activeId}`}
            roundId={round.id}
            telemetry={telemetry}
            context={{ feedback: activeFeedback, activeQuestion, stage: stage === 1 ? "sense" : "plan" }}
          />
        )}
      </div>
      <footer className="sense-footer">
        <div>
          {stage === 2 ? (
            <button
              type="button"
              className="btn-outline"
              disabled={busy}
              onClick={() => changeStage(1)}
            >
              ← 해석으로 돌아가기
            </button>
          ) : (
            <span>세 영역의 질문을 모두 작성해 주세요.</span>
          )}
        </div>
        <p>
          {telemetry.error
            ? "저장 상태를 확인해 주세요"
            : telemetry.pending
              ? "서버에 저장 중…"
              : "서버에 저장됨"}
        </p>
        <button
          type="button"
          className="sense-primary"
          disabled={
            busy ||
            areaCount !== fields.length ||
            (stage === 2 && !allReady && !nextFeedback)
          }
          onClick={next}
        >
          {busy
            ? "저장하고 있습니다…"
            : allReady
              ? stage === 1
                ? "행동계획으로 →"
                : "다음 발표 넘어가기"
              : nextFeedback
                ? `다음 영역: ${nextFeedback.area} →`
                : "작성 내용을 확인해 주세요"}
        </button>
      </footer>
    </main>
  );
}
