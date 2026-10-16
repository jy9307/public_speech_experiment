"use client";

import Image from "next/image";
import ChatPanel from "./ChatPanel";
import { useEffect, useMemo, useRef, useState } from "react";
import { FeedbackCategoryIcon } from "./FeedbackAreaIcons";

const VIDEO_URL = "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/recordings%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fpresentations%2F6FN9JPhjIBGqnYAep9Ku%2Fattempts%2FMJuO5yhJuUeCt8gpjNe8%2Fraw%2Fsimulation_559132.mp4?alt=media&token=3b56de6c-40e9-4e22-aec1-3ed68109ab94";

const PRESENTATION_SLIDES = [
    { page: 1, seconds: 0, time: "00:00", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_001.png?alt=media&token=605a1ee1-c446-44f1-8142-7ec758017c4d" },
    { page: 2, seconds: 31.388916015625, time: "00:31", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_002.png?alt=media&token=78430da3-555d-490a-8dc9-7a9459885db9" },
    { page: 3, seconds: 49.27777099609375, time: "00:49", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_003.png?alt=media&token=8142b427-a65f-454f-9463-9c05623627d0" },
    { page: 4, seconds: 167.8402099609375, time: "02:47", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_004.png?alt=media&token=3d726c44-5884-4525-86ec-a9c18bb386e2" },
    { page: 5, seconds: 220.15948486328125, time: "03:40", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_005.png?alt=media&token=469c0575-64d3-4033-839e-912ff33861e6" },
    { page: 6, seconds: 323.24273681640625, time: "05:23", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_006.png?alt=media&token=53a5c5e5-e5bc-4d75-b1bc-05d5ac018222" },
    { page: 7, seconds: 424.0067138671875, time: "07:04", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_007.png?alt=media&token=68b6c1de-b857-4169-bb56-ae8796757a66" },
    { page: 8, seconds: 449.4024658203125, time: "07:29", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_008.png?alt=media&token=21580635-85fa-43b1-b252-cef84794cf99" },
    { page: 9, seconds: 497.59686279296875, time: "08:17", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_009.png?alt=media&token=a1762d2b-fa76-4706-b50c-e70bde8f3005" },
    { page: 10, seconds: 567.4302978515625, time: "09:27", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_010.png?alt=media&token=c3d9f1ce-b8fe-4751-b52d-918db48a454c" },
    { page: 11, seconds: 607.874755859375, time: "10:07", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_011.png?alt=media&token=334928fe-2213-4d75-8b2c-b8195419f307" },
];

const FEEDBACK = [
    {
        id: "content-claim",
        categoryId: "content",
        subarea: "발표 내용의 적절성",
        area: "내용",
        title: "연구 질문과 분석 범위",
        time: "00:49",
        seconds: 49,
        summary: "EF EPI 순위에서 두 연구 질문으로 넘어가지만, 순위 자료와 관사 오류 분석의 연결이 설명되지 않아 연구의 출발점이 약합니다.",
        evidence: "EF EPI는 읽기와 듣기 시험이라 발화 자료와 직접 비교하기 어렵다고 밝힌 직후, 두 집단의 관사 사용 질문으로 넘어갑니다.",
        rationale: "비교가 어려운 통계를 제시한 이유와 뒤의 발화 분석에서 확인할 변수를 연결하지 않아, 청중은 순위 자료가 연구 설계에서 어떤 역할을 하는지 판단하기 어렵습니다.",
        suggestion: "순위 자료 뒤에 ‘이 수치는 사례 선정의 출발점이며, 이후에는 관사 정확도와 오류 유형만 비교하겠습니다’라고 분석 범위를 명시하세요.",
    },
    {
        id: "organization-opening",
        categoryId: "organization",
        subarea: "발표 구조의 완결성",
        area: "조직",
        title: "목차와 논증 흐름의 연결",
        time: "00:31",
        seconds: 31,
        summary: "다섯 개 목차를 제시하지만 각 단계가 다음 단계로 이어지는 이유를 설명하지 않아 발표의 논증 흐름이 목록 수준에 머뭅니다.",
        evidence: "연구 주제, 이론적 배경, 자료 분석, 결과 해석, 결론을 차례로 읽은 뒤 바로 연구 주제로 넘어갑니다.",
        rationale: "목차 이름만으로는 이론이 분석 기준이 되고 자료가 결론으로 이어지는 관계가 드러나지 않습니다.",
        suggestion: "목차 뒤에 ‘모국어 전이 개념을 기준으로 실제 발화를 분석한 뒤, 오류의 양과 유형을 나누어 해석하겠습니다’라는 흐름 안내 문장을 추가하세요.",
    },
    {
        id: "delivery-eye",
        categoryId: "expression",
        subarea: "비언어적 표현의 효과적 활용",
        area: "표현 및 전달",
        title: "핵심 전환의 시각적 강조",
        time: "03:40",
        seconds: 220,
        summary: "표정과 고개 움직임이 거의 일정해, 분석 방법의 핵심인 ‘오류 개수가 아니라 반복 유형’이라는 전환이 시각적으로 구분되지 않습니다.",
        evidence: "의무적 맥락 분석과 세 오류 유형을 설명하는 동안 얼굴 방향과 자세가 동일하게 유지됩니다.",
        rationale: "정보의 중요도가 바뀌는 지점에도 비언어 표현이 같아 청중이 핵심 기준과 세부 설명을 구분하기 어렵습니다.",
        suggestion: "‘핵심은 오류의 개수가 아니라 유형입니다’라고 말하기 전 1초 멈추고, 정면을 본 상태에서 고개를 가볍게 들어 문장을 강조하세요.",
    },
];

function SyncedPresentationPanel({ videoRef, activeFeedback, currentSlide, videoSeconds, onTimeChange, videoLabel = "공태윤 학생 발표 영상" }) {
    return (
        <aside className="e2a-video-panel">
            <div className="e2a-video-frame">
                <video
                    ref={videoRef}
                    src={VIDEO_URL}
                    controls
                    preload="metadata"
                    playsInline
                    onLoadedMetadata={(event) => {
                        const resumeAt = Math.min(videoSeconds, event.currentTarget.duration || videoSeconds);
                        event.currentTarget.currentTime = resumeAt;
                        onTimeChange(resumeAt);
                    }}
                    onTimeUpdate={(event) => onTimeChange(event.currentTarget.currentTime || 0)}
                    onSeeked={(event) => onTimeChange(event.currentTarget.currentTime || 0)}
                />
            </div>
            <div className="e2a-video-caption"><div><span>{videoLabel}</span><strong>모어의 관사 유무 차이</strong></div><time>{activeFeedback.time}</time></div>
            <section className="e2a-slide-sync" aria-live="polite" aria-label="영상과 동기화된 발표자료">
                <header>
                    <div><span>발표자료</span><strong>{currentSlide.page} / {PRESENTATION_SLIDES.length} 페이지</strong></div>
                    <time>{currentSlide.time}</time>
                </header>
                <div className="e2a-slide-preview"><img src={currentSlide.imageUrl} alt={`공태윤 학생 발표자료 ${currentSlide.page}페이지`} /></div>
            </section>
        </aside>
    );
}

const emptyAnswers = () => Object.fromEntries(FEEDBACK.map(item => [item.id, ""]));

export default function FeedbackWorkspace({ participant }) {
    const videoRef = useRef(null);
    const [stage, setStage] = useState(1);
    const [activeId, setActiveId] = useState(FEEDBACK[0].id);
    const [interpretations, setInterpretations] = useState(emptyAnswers);
    const [plans, setPlans] = useState(emptyAnswers);
    const [saved, setSaved] = useState(false);
    const [videoSeconds, setVideoSeconds] = useState(0);
    const [hydrated, setHydrated] = useState(false);
    const [storageError, setStorageError] = useState("");
    const storageKey = `speech-experiment:v2:${participant.id}`;

    useEffect(() => {
        try {
            const draft = JSON.parse(localStorage.getItem(storageKey) || "null");
            const restore = values => Object.fromEntries(FEEDBACK.map(item => [item.id, typeof values?.[item.id] === "string" ? values[item.id] : ""]));
            if (draft) { setInterpretations(restore(draft.interpretations)); setPlans(restore(draft.plans)); }
        } catch { setStorageError("저장된 내용을 불러오지 못했습니다."); }
        setHydrated(true);
    }, [storageKey]);

    useEffect(() => {
        if (!hydrated) return;
        try { localStorage.setItem(storageKey, JSON.stringify({ interpretations, plans })); }
        catch { setStorageError("브라우저에 저장할 수 없습니다. 저장 설정을 확인해 주세요."); }
    }, [interpretations, plans, hydrated, storageKey]);

    const activeFeedback = FEEDBACK.find(item => item.id === activeId) || FEEDBACK[0];
    const interpretedCount = FEEDBACK.filter(item => interpretations[item.id].trim()).length;
    const stageOneReady = interpretedCount === FEEDBACK.length;
    const plannedCount = FEEDBACK.filter(item => plans[item.id].trim()).length;
    const planReady = stageOneReady && plannedCount === FEEDBACK.length;
    const currentSlide = useMemo(() => {
        let slide = PRESENTATION_SLIDES[0];
        for (const candidate of PRESENTATION_SLIDES) {
            if (candidate.seconds <= videoSeconds + 0.75) slide = candidate;
            else break;
        }
        return slide;
    }, [videoSeconds]);

    function seekToFeedback(item) {
        setActiveId(item.id);
        setVideoSeconds(item.seconds);
        if (videoRef.current) {
            videoRef.current.currentTime = item.seconds;
            videoRef.current.play().catch(() => {});
        }
    }

    function selectFeedback(item) {
        setActiveId(item.id);
        setVideoSeconds(item.seconds);
        if (videoRef.current) videoRef.current.currentTime = item.seconds;
    }

    function handleTabKeyDown(event, index) {
        const keys = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: FEEDBACK.length - 1 };
        if (!(event.key in keys)) return;
        event.preventDefault();
        const nextIndex = (keys[event.key] + FEEDBACK.length) % FEEDBACK.length;
        selectFeedback(FEEDBACK[nextIndex]);
        event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
    }

    function savePlan() {
        if (!planReady) return;
        try {
            localStorage.setItem(storageKey, JSON.stringify({ interpretations, plans, savedAt: new Date().toISOString() }));
            setSaved(true);
        } catch { setStorageError("저장하지 못했습니다. 브라우저 저장 설정을 확인해 주세요."); }
    }

    if (!hydrated) return <main className="loading-screen">불러오는 중…</main>;

    return (
        <main className={`sense-workspace ${participant.group === "experiment" ? "has-chat" : ""}`}>
            <header className="sense-header">
                <a href="/" className="sense-brand"><Image src="/logo.png" alt="" width={28} height={28} /><span>발표 피드백</span></a>
                <nav aria-label="피드백 활용 단계" className="sense-stages">
                    <button type="button" aria-current={stage === 1 ? "step" : undefined} onClick={() => setStage(1)}><span>1</span> 피드백 해석</button>
                    <i aria-hidden="true" />
                    <button type="button" aria-current={stage === 2 ? "step" : undefined} disabled={!stageOneReady} onClick={() => setStage(2)}><span>2</span> 행동계획</button>
                </nav>
                <div className="header-actions"><span>{participant.id}</span><form action="/api/session" method="post"><input type="hidden" name="logout" value="true" /><button className="btn-outline" type="submit">나가기</button></form></div>
            </header>

            <div className="sense-body">
                <SyncedPresentationPanel videoRef={videoRef} activeFeedback={activeFeedback} currentSlide={currentSlide} videoSeconds={videoSeconds} onTimeChange={setVideoSeconds} />
                <section className="sense-board" aria-label={stage === 1 ? "피드백 해석" : "행동계획 작성"}>
                    <div className="sense-tabs" role="tablist" aria-label="피드백 영역">
                        {FEEDBACK.map((item, index) => (
                            <button key={item.id} id={`tab-${item.id}`} type="button" role="tab" aria-selected={activeId === item.id} aria-controls="feedback-panel" tabIndex={activeId === item.id ? 0 : -1} onClick={() => selectFeedback(item)} onKeyDown={event => handleTabKeyDown(event, index)}>
                                <FeedbackCategoryIcon categoryId={item.categoryId} />
                                <span>{item.area}</span>
                                {(stage === 1 ? interpretations[item.id] : plans[item.id]).trim() && <span className="sense-tab-done" aria-label="작성 완료">✓</span>}
                            </button>
                        ))}
                    </div>
                    {[activeFeedback].map(item => (
                        <article key={item.id} id="feedback-panel" role="tabpanel" aria-labelledby={`tab-${item.id}`} className={`sense-card category-${item.categoryId} active`}>
                            <header><div><FeedbackCategoryIcon categoryId={item.categoryId} /><span>{item.area}</span><h2>{item.title}</h2></div><button type="button" onClick={() => seekToFeedback(item)} aria-label={`${item.area} 피드백 ${item.time} 재생`}>▷ {item.time}</button></header>
                            <div className="sense-card-body">
                                <div className="sense-feedback"><p>{item.summary}</p><p>{item.suggestion}</p></div>
                                <div className="sense-writing">
                                    {stage === 2 && <label className="sense-prior"><span>나의 해석</span><textarea aria-label={`${item.area} 작성한 해석`} value={interpretations[item.id]} readOnly rows={2} /></label>}
                                    <label className="sense-answer" htmlFor={`answer-${item.id}`}><span>{stage === 1 ? "나의 해석" : "나의 행동계획"}</span><textarea id={`answer-${item.id}`} aria-label={`${item.area} ${stage === 1 ? "나의 해석" : "나의 행동계획"}`} value={stage === 1 ? interpretations[item.id] : plans[item.id]} onChange={event => { const value = event.target.value; (stage === 1 ? setInterpretations : setPlans)(current => ({ ...current, [item.id]: value })); setSaved(false); }} placeholder={stage === 1 ? "이 피드백을 어떻게 이해했나요? 자신의 말로 적어 주세요." : "나의 해석을 바탕으로 다음 발표에서 실천할 행동을 적어 주세요."} rows={3} /></label>
                                </div>
                            </div>
                        </article>
                    ))}
                </section>
            </div>

            <footer className="sense-footer">
                <div>{stage === 2 && <button type="button" className="btn-outline" onClick={() => setStage(1)}>이전</button>}</div>
                <p>{stage === 1 ? `해석 ${interpretedCount} / 3` : `행동계획 ${plannedCount} / 3`}</p>
                {stage === 1 ? <button type="button" className="sense-primary" disabled={!stageOneReady} onClick={() => setStage(2)}>다음 →</button> : <button type="button" className="sense-primary" disabled={!planReady} onClick={savePlan}>행동계획 저장</button>}
            </footer>
            {participant.group === "experiment" && <ChatPanel key={activeId} participantId={participant.id} feedbackId={activeId} context={{ stage, feedback: activeFeedback, interpretation: interpretations[activeId], plan: plans[activeId] }} />}
            {storageError && <p className="sense-notice error" role="alert">{storageError}</p>}
            {saved && <p className="sense-notice" role="status">행동계획을 저장했습니다.</p>}
        </main>
    );
}
