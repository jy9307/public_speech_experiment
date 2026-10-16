import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { publicFeedback, rubricItem, EXCLUDED_RUBRIC_IDS } from "./rubric.js";

export async function analysisContext(roundNumber, previousRound) {
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 5)
    throw new Error("Invalid analysis round");
  if (previousRound && previousRound.number !== roundNumber - 1)
    throw new Error("Invalid preceding round");
  const text = await readFile(
    new URL("../../speaking_materials.md", import.meta.url),
    "utf8",
  );
  if (!text.trim()) throw new Error("Speaking materials are empty");
  const feedback = Array.isArray(previousRound?.feedback)
    ? previousRound.feedback.filter((row) => !EXCLUDED_RUBRIC_IDS.includes(row.rubricItemId)).map(publicFeedback).map((row) => ({
        categoryId: row.categoryId,
        rubricItemId: rubricItem(row.categoryId, row.rubricItemId) && !EXCLUDED_RUBRIC_IDS.includes(row.rubricItemId)
          ? row.rubricItemId
          : null,
        text: row.text,
      }))
    : [];
  return {
    roundNumber,
    materials: {
      source: "speaking_materials.md",
      text,
      sha256: createHash("sha256").update(text).digest("hex"),
    },
    previousRound:
      feedback.length && roundNumber > 1
        ? { number: previousRound.number, feedback }
        : null,
  };
}
