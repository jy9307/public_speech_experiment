import { publicFeedback } from "./rubric.js";
import { randomUUID } from "node:crypto";
import { database, transaction } from "./db.js";
export const AREAS = ["content", "organization", "expression"];
export const FIELDS = {
  sense: ["comparison", "explanation", "judgment"],
  plan: ["goal", "strategy"],
};
export function assertStudy(condition, message, status = 409) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
export async function ownedRound(
  participantId,
  roundId,
  client = database(),
  lock = false,
) {
  assertStudy(
    typeof roundId === "string" && /^[a-f0-9-]{36}$/i.test(roundId),
    "회차를 확인해 주세요.",
    400,
  );
  const row = (
    await client.query(
      `SELECT * FROM speech_experiment.rounds WHERE id=$1 AND participant_id=$2${lock ? " FOR UPDATE" : ""}`,
      [roundId, participantId],
    )
  ).rows[0];
  assertStudy(row, "회차에 접근할 수 없습니다.", 404);
  return row;
}
export async function loadStudy(participantId) {
  const storedRounds = (
    await database().query(
      "SELECT id,number,state,started_at,recording_ended_at,upload_received_at,analysis_started_at,analysis_completed_at,participant_finished_at,completed_at,interrupted_at,feedback,analysis_error FROM speech_experiment.rounds WHERE participant_id=$1 ORDER BY number",
      [participantId],
    )
  ).rows;
  const rounds = storedRounds.map((round) => ({
    ...round,
    feedback: Array.isArray(round.feedback)
      ? round.feedback.map(publicFeedback)
      : round.feedback,
  }));
  const round = rounds.find((r) => r.state !== "completed") || rounds.at(-1);
  const prior = rounds.find((r) => r.number === round.number - 1);
  const responses = (
    await database().query(
      "SELECT stage,area,field,value FROM speech_experiment.responses WHERE round_id=$1",
      [round.id],
    )
  ).rows;
  const previousPlan = prior
    ? (
        await database().query(
          "SELECT area,field,value FROM speech_experiment.responses WHERE round_id=$1 AND stage='plan' AND field IN ('goal','strategy')",
          [prior.id],
        )
      ).rows
    : [];
  return {
    rounds,
    round,
    responses,
    previousPlan,
    finished:
      rounds.length === 5 && rounds.slice(0, 4).every((r) => r.state === "completed") && Boolean(rounds.at(-1).participant_finished_at),
  };
}
export async function requireResponses(client, roundId, stage) {
  const rows = (
    await client.query(
      "SELECT area,field,value FROM speech_experiment.responses WHERE round_id=$1 AND stage=$2",
      [roundId, stage],
    )
  ).rows;
  for (const area of AREAS)
    for (const field of FIELDS[stage]) {
      assertStudy(
        rows.some(
          (r) => r.area === area && r.field === field && r.value.trim(),
        ),
        "모든 영역의 응답을 작성하고 저장해 주세요.",
      );
    }

}
export async function transition(participantId, roundId, action) {
  return transaction(async (client) => {
    const r = await ownedRound(participantId, roundId, client, true);
    const latest = (
      await client.query(
        "SELECT max(number) AS n FROM speech_experiment.rounds WHERE participant_id=$1",
        [participantId],
      )
    ).rows[0].n;
    assertStudy(r.number === latest, "최신 회차에서 진행해 주세요.");
    if (action === "start") {
      assertStudy(
        ["ready", "recording"].includes(r.state),
        "발표를 시작할 수 없는 단계입니다.",
      );
      await client.query(
        "UPDATE speech_experiment.rounds SET state='recording',started_at=COALESCE(started_at,now()),last_seen_at=now(),recording_attempts=recording_attempts+1 WHERE id=$1",
        [r.id],
      );
    } else if (action === "plan") {
      assertStudy(
        ["sense", "plan"].includes(r.state),
        "피드백 해석 단계에서 이동해 주세요.",
      );
      await requireResponses(client, r.id, "sense");
      await client.query(
        "UPDATE speech_experiment.rounds SET state='plan' WHERE id=$1",
        [r.id],
      );
    } else if (action === "sense") {
      assertStudy(
        ["sense", "plan"].includes(r.state),
        "이 단계에서는 해석으로 돌아갈 수 없습니다.",
      );
      await client.query(
        "UPDATE speech_experiment.rounds SET state='sense' WHERE id=$1",
        [r.id],
      );
    } else if (action === "next") {
      assertStudy(
        r.number < 5 && r.state === "plan",
        "행동계획 단계에서 이동해 주세요.",
      );
      await requireResponses(client, r.id, "sense");
      await requireResponses(client, r.id, "plan");
      await client.query(
        "UPDATE speech_experiment.rounds SET state='completed',completed_at=now() WHERE id=$1",
        [r.id],
      );
      await client.query(
        "INSERT INTO speech_experiment.rounds(id,participant_id,number) VALUES($1,$2,$3) ON CONFLICT(participant_id,number) DO NOTHING",
        [randomUUID(), participantId, r.number + 1],
      );
    } else if (action === "timeout_next") {
      assertStudy(r.number < 5 && ["sense", "plan"].includes(r.state), "피드백 또는 행동계획 단계에서만 시간을 마칠 수 있습니다.");
      await client.query("UPDATE speech_experiment.rounds SET state='completed',completed_at=now() WHERE id=$1", [r.id]);
      await client.query(
        "INSERT INTO speech_experiment.rounds(id,participant_id,number) VALUES($1,$2,$3) ON CONFLICT(participant_id,number) DO NOTHING",
        [randomUUID(), participantId, r.number + 1],
      );
    } else if (action === "finish") {
      assertStudy(r.number === 5 && ["completed", "analyzing", "analysis_failed"].includes(r.state), "마지막 발표 전송 후 종료할 수 있습니다.");
      assertStudy(r.upload_received_at || (r.timing_version === 1 && r.recording_ended_at), "마지막 영상을 먼저 전송해 주세요.");
      await client.query("UPDATE speech_experiment.rounds SET participant_finished_at=COALESCE(participant_finished_at,now()),completed_at=COALESCE(completed_at,now()) WHERE id=$1", [r.id]);
      await client.query("UPDATE speech_experiment.participants SET completed_at=COALESCE(completed_at,now()) WHERE id=$1", [participantId]);
    } else if (action === "retry") {
      assertStudy(
        r.state === "analysis_failed",
        "재분석할 수 없는 단계입니다.",
      );
      await client.query(
        "UPDATE speech_experiment.rounds SET state='analyzing',analysis_claim=NULL,analysis_started_at=NULL,analysis_error=NULL WHERE id=$1",
        [r.id],
      );
    } else
      throw Object.assign(new Error("알 수 없는 동작입니다."), { status: 400 });
    await client.query(
      "INSERT INTO speech_experiment.events(id,round_id,type,screen,component,client_at,payload) VALUES($1,$2,$3,$4,$5,now(),$6)",
      [
        randomUUID(),
        r.id,
        "transition",
        r.state,
        action,
        JSON.stringify({ action, source: "server" }),
      ],
    );
  });
}
