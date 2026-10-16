import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { validateEvents } from "../app/lib/events.js";
test("assignment roster is fixed, balanced and marks first two per group as tests", async () => {
  const rows = (
    await readFile(new URL("../db/assignments.csv", import.meta.url), "utf8")
  )
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => l.split(","));
  assert.equal(rows.length, 100);
  assert.equal(new Set(rows.map((r) => r[0])).size, 100);
  for (const condition of ["ctrl", "exp"]) {
    const group = rows.filter((r) => r[1] === condition);
    assert.equal(group.length, 50);
    assert.deepEqual(
      group.filter((r) => r[2] === "true"),
      group.slice(0, 2),
    );
  }
});
function event(overrides = {}) {
  return {
    id: randomUUID(),
    roundId: randomUUID(),
    type: "response_edit",
    screen: "sense",
    at: new Date().toISOString(),
    payload: {
      area: "content",
      field: "explanation",
      before: "전",
      after: "수정",
    },
    ...overrides,
  };
}
test("event contract refuses invalid activity fields and control chat telemetry", () => {
  validateEvents([event()], "control");
  assert.throws(() =>
    validateEvents(
      [
        event({
          payload: {
            area: "content",
            field: "goal",
            before: "",
            after: "test",
          },
        }),
      ],
      "control",
    ),
  );
  assert.throws(() =>
    validateEvents([event({ type: "chat_start", payload: {} })], "control"),
  );
  assert.throws(() =>
    validateEvents(
      [event({ type: "chat_end", payload: { durationMs: -1 } })],
      "experiment",
    ),
  );
});

test("feedback uses canonical rubric labels and preserves continuous saved text", async () => {
  const { normalizeFeedback, feedbackText, RUBRIC_CATEGORIES } = await import(
    "../app/lib/rubric.js"
  );
  const normalized = normalizeFeedback({
    categoryId: "expression",
    rubricItemId: "presentation_fluency",
    area: "잘못된 영역",
    title: "잘못된 루브릭",
    subarea: "잘못된 소항목",
    rubricDescription: "임의 설명",
    text: "관찰한 발화를 근거로 구체적인 실천을 제안합니다.",
  });
  assert.equal(normalized.area, "표현 및 전달");
  assert.equal(normalized.title, "발표의 유창성");
  assert.equal(
    normalized.rubricDescription,
    RUBRIC_CATEGORIES[2].items[2].desc,
  );
  assert.equal(feedbackText(normalized), normalized.text);
  const legacy = normalizeFeedback({
    categoryId: "organization",
    rubricItemId: "organization_flow",
    area: "옛 이름",
    subarea: "옛 루브릭",
    summary: "문제 설명",
    evidence: "관찰 근거",
    suggestion: "구체적인 해결책",
  });
  assert.equal(legacy.title, "조직");
  assert.equal(legacy.subarea, "");
  assert.equal(feedbackText(legacy), "문제 설명 관찰 근거 구체적인 해결책");
});

test("public feedback excludes evaluator scores, grade and nested audit data", async () => {
  const { publicFeedback } = await import("../app/lib/rubric.js");
  const visible = publicFeedback({
    id: "content",
    categoryId: "content",
    rubricItemId: "topic_relevance",
    text: "관찰 근거와 구체적인 실천 계획입니다.",
    score: 1,
    scores: { topic_relevance: 1 },
    grade: "1점",
    selectedScore: 1,
    rationale: "내부 점수는 2점입니다.",
    evidence: "내부 평가 근거",
    criterionAssessments: [{ score: 1 }],
    scopeReports: [],
    privateAssessments: [{ score: 1 }],
  });
  for (const key of [
    "score",
    "scores",
    "grade",
    "selectedScore",
    "criterionAssessments",
    "scopeReports",
    "privateAssessments",
    "rubricLevels",
    "rationale",
    "evidence",
    "summary",
    "suggestion",
  ])
    assert.equal(Object.hasOwn(visible, key), false);
  assert.equal(visible.title, "주제 적절성");
});

test("engine contract requires all criterion assessments and deterministic lowest-score feedback", async () => {
  const { RUBRIC_CATEGORIES } = await import("../app/lib/rubric.js");
  const { validEngineResult } = await import("../app/lib/engine-result.js");
  const assessments = RUBRIC_CATEGORIES.flatMap((c) =>
    c.items.map((item, i) => ({
      categoryId: c.id,
      rubricItemId: item.id,
      score: i === 1 ? 1 : 3,
      feedback: { rubricItemId: item.id, seconds: 0, text: "한 세부영역에 한정된 피드백" },
    })),
  );
  const result = {
    analysisResult: {
      pipeline: "grouped-criterion-algorithmic",
      validation: { mode: "algorithmic" },
      context: { roundNumber: 1 },
      criterionAssessments: assessments,
      scores: Object.fromEntries(
        assessments.map((a) => [a.rubricItemId, a.score]),
      ),
      selectedItemIds: Object.fromEntries(
        RUBRIC_CATEGORIES.map((c) => [c.id, c.items[1].id]),
      ),
    },
    feedback: RUBRIC_CATEGORIES.map((c) => ({
      categoryId: c.id,
      rubricItemId: c.items[1].id,
      seconds: 0, time:"00:00",
      summary: "관찰된 문제",
      suggestion: "같은 세부영역의 해결책",
      text: "문제와 해결책을 연결한 피드백",
    })),
  };
  assert.equal(validEngineResult(result, 1), true);
  const wrongSelection = structuredClone(result);
  wrongSelection.feedback[0].rubricItemId = RUBRIC_CATEGORIES[0].items[0].id;
  assert.equal(validEngineResult(wrongSelection, 1), false);
  const wrongTime = structuredClone(result);wrongTime.feedback[0].time="02:14";
  assert.equal(validEngineResult(wrongTime,1),false);
  const wrongAnchor = structuredClone(result);wrongAnchor.feedback[0].seconds=94;wrongAnchor.feedback[0].time="01:34";
  assert.equal(validEngineResult(wrongAnchor,1),false);
  const missing = structuredClone(result);
  missing.analysisResult.criterionAssessments.pop();
  assert.equal(validEngineResult(missing, 1), false);
  const wrongScore = structuredClone(result);
  wrongScore.analysisResult.criterionAssessments[0].score = 5;
  assert.equal(validEngineResult(wrongScore, 1), false);
  const final = structuredClone(result);
  final.analysisResult.context.roundNumber = 5;
  final.feedback = [];
  assert.equal(validEngineResult(final, 5), true);
  const oldPipeline = structuredClone(result);
  oldPipeline.analysisResult.pipeline = "isolated-criterion-evaluators";
  assert.equal(validEngineResult(oldPipeline, 1), false);
  assert.equal(validEngineResult(result, 1, { roundNumber: 2 }), false);
});

test("analysis context snapshots materials and only preceding feedback without prior scores", async () => {
  const { analysisContext } = await import("../app/lib/analysis-context.js");
  const first = await analysisContext(1);
  assert.equal(first.previousRound, null);
  assert.match(first.materials.text, /세온 호수/);
  const second = await analysisContext(2, {
    number: 1,
    feedback: [{ categoryId: "content", rubricItemId: "presentation_content", text: "이전 발표의 내용 관련 피드백", score: 1, criterionAssessments: [{ score: 1 }] }],
  });
  assert.equal(second.previousRound.number, 1);
  assert.deepEqual(Object.keys(second.previousRound.feedback[0]).sort(), ["categoryId", "rubricItemId", "text"]);
  assert.equal(second.materials.sha256, first.materials.sha256);
  await assert.rejects(analysisContext(3, { number: 1, feedback: [] }));
  const legacy = await analysisContext(2, { number: 1, feedback: [{ categoryId: "organization", rubricItemId: "organization_flow", summary: "예전 문제", suggestion: "예전 해결책" }] });
  assert.equal(legacy.previousRound.feedback[0].rubricItemId, null);
  assert.match(legacy.previousRound.feedback[0].text, /예전 문제/);
});


test("study rubric excludes two criteria without altering the supplied rubric", async()=>{
 const {RUBRIC_CATEGORIES,EXCLUDED_RUBRIC_IDS}=await import('../app/lib/rubric.js');
 assert.deepEqual(RUBRIC_CATEGORIES.map(c=>c.items.length),[2,3,5]);
 assert.equal(RUBRIC_CATEGORIES.flatMap(c=>c.items).some(i=>EXCLUDED_RUBRIC_IDS.includes(i.id)),false);
 const {analysisContext}=await import('../app/lib/analysis-context.js');
 const excluded=await analysisContext(2,{number:1,feedback:[{categoryId:'content',rubricItemId:'topic_relevance',text:'이전 주제 평가'}]});
 assert.equal(excluded.previousRound,null);
});
