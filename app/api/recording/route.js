import { after } from "next/server";
import { api } from "../../lib/api";
import { transaction } from "../../lib/db";
import { assertStudy, ownedRound } from "../../lib/study";
import { MAX_VIDEO_BYTES, processAnalysis } from "../../lib/analysis";
import { storeRecording } from "../../lib/recording-storage";
export const runtime = "nodejs";
export const maxDuration = 1200;
export async function POST(request) {
  return api(request, async (p) => {
    const length = Number(request.headers.get("content-length"));
    assertStudy(
      !length || length <= MAX_VIDEO_BYTES + 10000,
      "영상은 100MB 이하여야 합니다.",
      413,
    );
    const form = await request.formData();
    const video = form.get("video");
    const roundId = form.get("roundId");
    const duration = Number(form.get("durationMs"));
    const pausedDuration = Number(form.get("pausedDurationMs") || 0);
    const recordingStartedAt = form.get("recordingStartedAt");
    const recordingEndedAt = form.get("recordingEndedAt");
    const uploadStartedAt = form.get("uploadStartedAt");
    const times = [recordingStartedAt, recordingEndedAt, uploadStartedAt].map(Date.parse);
    assertStudy(times.every(Number.isFinite) && times.every((t) => Math.abs(Date.now() - t) < 7 * 86400000) && times[0] <= times[1] && times[1] <= times[2] && Number.isInteger(pausedDuration) && pausedDuration >= 0 && pausedDuration <= 7 * 86400000 && Math.abs(times[1] - times[0] - pausedDuration - duration) < 5000, "녹화 시각을 확인해 주세요.", 400);
    assertStudy(
      video instanceof File &&
        video.size > 0 &&
        video.size <= MAX_VIDEO_BYTES &&
        /^(video\/webm|video\/mp4)(;.*)?$/.test(video.type) &&
        Number.isInteger(duration) &&
        duration > 0 &&
        duration <= 2 * 60 * 60 * 1000,
      "녹화 파일과 시간을 확인해 주세요.",
      400,
    );
    const bytes = Buffer.from(await video.arrayBuffer());
    await transaction(async (client) => {
      const round = await ownedRound(p.id, roundId, client, true);
      if (
        ["analyzing", "sense", "plan", "completed", "analysis_failed"].includes(
          round.state,
        )
      )
        return;
      assertStudy(
        round.state === "recording",
        "발표를 시작한 다음 업로드해 주세요.",
      );
      const stored = await storeRecording({ participantId: p.id, number: round.number, roundId, mimeType: video.type.split(";")[0], bytes });
      await client.query(
        "INSERT INTO speech_experiment.recordings(round_id,mime_type,duration_ms,paused_duration_ms,byte_size,storage_bucket,storage_path,storage_generation,sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(round_id) DO NOTHING",
        [roundId, video.type.split(";")[0], duration, pausedDuration, video.size, stored.storage_bucket, stored.storage_path, stored.storage_generation, stored.sha256],
      );
      await client.query(
        "UPDATE speech_experiment.rounds SET state='analyzing',recording_started_at=$2,recording_ended_at=$3,upload_started_at=$4,upload_received_at=now(),timing_version=2 WHERE id=$1",
        [roundId, recordingStartedAt, recordingEndedAt, uploadStartedAt],
      );
    });
    after(() => processAnalysis(roundId));
    return Response.json({ saved: true });
  });
}
