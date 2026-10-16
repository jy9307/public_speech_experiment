import { RUBRIC_CATEGORIES } from "./rubric.js";
import { isDeepStrictEqual } from "node:util";
export function validEngineResult(result, roundNumber, expectedContext) {
  const analysis = result?.analysisResult;
  if (
    analysis?.pipeline !== "grouped-criterion-algorithmic" ||
    analysis.validation?.mode !== "algorithmic" ||
    analysis.context?.roundNumber !== roundNumber ||
    (expectedContext && !isDeepStrictEqual(analysis.context, expectedContext)) ||
    !Array.isArray(analysis.criterionAssessments)
  )
    return false;
  const items = RUBRIC_CATEGORIES.flatMap((category) =>
    category.items.map((item) => ({ ...item, categoryId: category.id })),
  );
  const assessments = analysis.criterionAssessments;
  if (
    assessments.length !== items.length ||
    new Set(assessments.map((a) => a.rubricItemId)).size !== items.length
  )
    return false;
  for (const item of items) {
    const assessment = assessments.find((a) => a.rubricItemId === item.id);
    if (
      !assessment ||
      assessment.categoryId !== item.categoryId ||
      !Number.isInteger(assessment.score) ||
      assessment.score < 1 ||
      assessment.score > 4 ||
      analysis.scores?.[item.id] !== assessment.score ||
      assessment.feedback?.rubricItemId !== item.id ||
      !assessment.feedback?.text?.trim()
    )
      return false;
  }
  const expected = RUBRIC_CATEGORIES.map(
    (category) =>
      category.items.reduce((lowest, item) =>
        analysis.scores[item.id] < analysis.scores[lowest.id] ? item : lowest,
      ).id,
  );
  if (
    !RUBRIC_CATEGORIES.every(
      (category, index) =>
        analysis.selectedItemIds?.[category.id] === expected[index],
    )
  )
    return false;
  if (
    !Array.isArray(result.feedback) ||
    result.feedback.length !== (roundNumber === 5 ? 0 : 3)
  )
    return false;
  if (roundNumber === 5) return true;
  return RUBRIC_CATEGORIES.every((category, index) => {
    const matching = result.feedback.filter(
      (f) => f.categoryId === category.id,
    );
    return (
      matching.length === 1 &&
      matching[0].rubricItemId === expected[index] &&
      Number.isFinite(matching[0].seconds) && matching[0].seconds >= 0 &&
      matching[0].seconds === assessments.find((a)=>a.rubricItemId === expected[index]).feedback.seconds &&
      matching[0].time === `${String(Math.floor(matching[0].seconds/60)).padStart(2,"0")}:${String(Math.floor(matching[0].seconds%60)).padStart(2,"0")}` &&
      ["summary", "suggestion", "text"].every(
        (field) =>
          typeof matching[0][field] === "string" && matching[0][field].trim(),
      )
    );
  });
}
