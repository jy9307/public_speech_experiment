import categories from "../../fdb_cat.json" with { type: "json" };
export const RUBRIC_LEVEL_LABELS = { 4: "매우 잘함", 3: "잘함", 2: "보통", 1: "노력요함" };
export const EXCLUDED_RUBRIC_IDS = ["topic_relevance", "presentation_materials"];
export const RUBRIC_CATEGORIES = categories.map((category) => ({
  ...category,
  items: category.items.filter((item) => !EXCLUDED_RUBRIC_IDS.includes(item.id)),
}));
export function rubricCategory(id) {
  return categories.find((category) => category.id === id);
}
export function rubricItem(categoryId, itemId) {
  return rubricCategory(categoryId)?.items.find((item) => item.id === itemId);
}
export function normalizeFeedback(feedback) {
  const category = rubricCategory(feedback.categoryId);
  const item = rubricItem(feedback.categoryId, feedback.rubricItemId);
  return {
    ...feedback,
    area: category?.label || feedback.categoryId,
    title: item?.label || category?.label || feedback.title,
    generatedTitle: feedback.generatedTitle || feedback.title,
    subarea: item?.label || "",
    rubricDescription: item?.desc || "",
    rubricLevels: item?.levels || null,
  };
}
export function feedbackText(feedback) {
  if (feedback.text?.trim()) return feedback.text.trim();
  // Preserve the observations in earlier saved feedback without its old section layout.
  return [
    ...new Set(
      [
        feedback.strength,
        feedback.summary,
        feedback.evidence,
        feedback.rationale,
        feedback.suggestion,
      ]
        .map((value) => value?.trim())
        .filter(Boolean),
    ),
  ].join(" ");
}

// Public feedback is an allowlist: private evaluator scores and audit records never leave the server.
export function publicFeedback(feedback) {
  const normalized = normalizeFeedback(feedback);
  // Internal scoring rationale can contain a textual rating, so only the learner paragraph is public.
  const fields = [
    "id",
    "categoryId",
    "rubricItemId",
    "area",
    "title",
    "subarea",
    "rubricDescription",
    "seconds",
    "time",
  ];
  return {
    text: feedbackText(normalized),
    ...Object.fromEntries(
      fields
        .filter((field) => normalized[field] !== undefined)
        .map((field) => [field, normalized[field]]),
    ),
  };
}
