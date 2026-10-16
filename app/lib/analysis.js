import { validEngineResult } from "./engine-result.js";
import { analysisContext } from "./analysis-context.js";
import { normalizeFeedback } from "./rubric.js";
import { randomUUID } from "node:crypto";
import { database, transaction } from "./db.js";
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export async function processAnalysis(roundId) {
  const claim = randomUUID();
  const job = await transaction(async (client) => {
    const r = (
      await client.query(
        "UPDATE speech_experiment.rounds SET analysis_claim=$2,analysis_started_at=now(),analysis_attempts=analysis_attempts+1 WHERE id=$1 AND state='analyzing' AND (analysis_claim IS NULL OR analysis_started_at < now()-interval '20 minutes') RETURNING *",
        [roundId, claim],
      )
    ).rows[0];
    if (!r) return null;
    const recording = (
      await client.query(
        "SELECT * FROM speech_experiment.recordings WHERE round_id=$1",
        [roundId],
      )
    ).rows[0];
    const p = (
      await client.query(
        "SELECT condition FROM speech_experiment.participants WHERE id=$1",
        [r.participant_id],
      )
    ).rows[0];
    const previousRound = (
      await client.query(
        "SELECT number,feedback FROM speech_experiment.rounds WHERE participant_id=$1 AND number=$2",
        [r.participant_id, r.number - 1],
      )
    ).rows[0];
    return { ...r, ...recording, condition: p.condition, previousRound };
  });
  if (!job) return false;
  try {
    if (!process.env.SPEECH_ENGINE_URL || !process.env.SPEECH_ENGINE_TOKEN)
      throw new Error("engine_configuration");
    const form = new FormData();
    form.set(
      "video",
      new Blob([job.video], { type: job.mime_type }),
      `recording.${job.mime_type.includes("mp4") ? "mp4" : "webm"}`,
    );
    form.set("duration", String(job.duration_ms / 1000));
    const context = await analysisContext(job.number, job.previousRound);
    form.set("study_context", JSON.stringify(context));
    const path =
      job.number === 5
        ? "/experiment/analyze"
        : `/experiment/feedback/${job.condition === "control" ? "ctrl" : "exp"}`;
    const response = await fetch(
      `${process.env.SPEECH_ENGINE_URL.replace(/\/$/, "")}${path}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.SPEECH_ENGINE_TOKEN}` },
        body: form,
        signal: AbortSignal.timeout(18 * 60 * 1000),
      },
    );
    if (!response.ok) throw new Error(`engine_http_${response.status}`);
    const result = await response.json();
    if (!validEngineResult(result, job.number, context))
      throw new Error("invalid_analysis");
    await transaction(async (client) => {
      const saved = await client.query(
        "UPDATE speech_experiment.rounds SET state=$3,analysis=$4,feedback=$5,analysis_error=NULL,analysis_completed_at=now() WHERE id=$1 AND analysis_claim=$2 AND state='analyzing' RETURNING id",
        [
          roundId,
          claim,
          job.number === 5 ? "completed" : "sense",
          JSON.stringify(result.analysisResult),
          JSON.stringify((result.feedback || []).map(normalizeFeedback)),
        ],
      );

    });
  } catch (error) {
    console.error(
      "[analysis] Failed:",
      error.message?.startsWith("engine_") ? error.message : error.name,
    );
    await database().query(
      "UPDATE speech_experiment.rounds SET state='analysis_failed',analysis_error=$3 WHERE id=$1 AND analysis_claim=$2 AND state='analyzing'",
      [
        roundId,
        claim,
        "영상 분석을 완료하지 못했습니다. 영상은 저장되어 있으므로 재분석할 수 있습니다.",
      ],
    );
  }
  return true;
}
