import { RUBRIC_CATEGORIES as categories } from "../app/lib/rubric.js";
import http from "node:http";
import { createHash } from "node:crypto";
const areas = [
  ["content", "내용"],
  ["organization", "조직"],
  ["expression", "표현 및 전달"],
];
export function startMockEngine(port = 8011) {
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (
      !req.headers.authorization?.startsWith("Bearer ") ||
      !Buffer.concat(chunks).length
    ) {
      res.writeHead(400);
      res.end("{}");
      return;
    }
    const form = await new Request("http://localhost" + req.url, {
      method: "POST",
      headers: req.headers,
      body: Buffer.concat(chunks),
    }).formData();
    const context = JSON.parse(form.get("study_context"));
    if (
      !context.materials.text.includes("세온 호수") ||
      createHash("sha256").update(context.materials.text).digest("hex") !== context.materials.sha256 ||
      (context.roundNumber === 1 && context.previousRound !== null) ||
      (context.roundNumber > 1 && (context.previousRound?.number !== context.roundNumber - 1 || context.previousRound?.feedback.length !== 3))
    ) {
      res.writeHead(400);
      res.end('{"error":"Invalid study context in integration test"}');
      return;
    }
    const feedback = areas.map(([categoryId, area]) => ({
      rubricItemId: categories.find((c) => c.id === categoryId).items[0].id,
      text: "핵심 내용을 제시한 뒤 구체적인 근거가 빠져 청중이 내용을 이해하기 어렵습니다. 핵심 문장 뒤에 실제 사례 한 가지를 덧붙여 설명해 주세요.",
      score: 1,
      scores: { hidden: 1 },
      privateAssessments: [{ score: 1 }],
      id: categoryId,
      categoryId,
      area,
      title: `${area} 핵심 개선점`,
      seconds: 0,
      time: "00:00",
      summary: "구체적인 발표 근거를 연결해 주세요.",
      evidence: "이 녹화에서 설명과 근거의 연결을 관찰했습니다.",
      rationale: "루브릭의 명료성 기준에 따른 개선점입니다.",
      suggestion: req.url.endsWith("exp")
        ? "핵심 문장 뒤에 근거를 덧붙여 보면 어떨까요? 📝"
        : "핵심 문장 뒤에 근거를 덧붙이세요.",
      strength: "",
      subarea: "명료성",
      rubricDescription: "근거를 명료하게 전달한다.",
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        analysisResult: {
          pipeline: "grouped-criterion-algorithmic",
          validation: { mode: "algorithmic" },
          context,
          scores: Object.fromEntries(
            categories.flatMap((c) =>
              c.items.map((item, i) => [item.id, i === 0 ? 1 : 3]),
            ),
          ),
          selectedItemIds: Object.fromEntries(
            categories.map((c) => [c.id, c.items[0].id]),
          ),
          criterionAssessments: categories.flatMap((c) =>
            c.items.map((item, i) => ({
              categoryId: c.id,
              rubricItemId: item.id,
              score: i === 0 ? 1 : 3,
              feedback: {
                rubricItemId: item.id,
                seconds: 0,
                text: "이 녹화에서 관찰한 세부영역별 피드백",
              },
            })),
          ),
          timestamps: [],
          testFixture: true,
        },
        feedback: req.url.endsWith("/analyze") ? [] : feedback,
      }),
    );
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () => resolve(server)),
  );
}
