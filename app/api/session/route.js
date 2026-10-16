import {
  clearParticipant,
  enrollParticipant,
  getParticipant,
  setParticipant,
} from "../../lib/session";
import { database } from "../../lib/db";
export async function POST(request) {
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return Response.json(
      { error: "허용되지 않은 요청입니다." },
      { status: 403 },
    );
  if (
    request.headers
      .get("content-type")
      ?.includes("application/x-www-form-urlencoded")
  ) {
    const form = await request.formData();
    if (form.get("logout") === "true") {
      const participant = await getParticipant();
      if (participant)
        await database().query(
          "UPDATE speech_experiment.rounds SET interrupted_at=now() WHERE participant_id=$1 AND state<>'completed' AND started_at IS NOT NULL AND participant_finished_at IS NULL",
          [participant.id],
        );
      await clearParticipant();
      return new Response(null, { status: 303, headers: { Location: "/" } });
    }
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "아이디를 확인해 주세요." }, { status: 400 });
  }
  let participant;
  try {
    participant = await enrollParticipant(body?.id);
  } catch {
    return Response.json(
      {
        error:
          "데이터 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 503 },
    );
  }
  if (!participant)
    return Response.json(
      { error: "등록되지 않은 아이디입니다. 안내받은 아이디를 확인해 주세요." },
      { status: 400 },
    );
  await setParticipant(participant);
  return Response.json({ path: `/${participant.group}` });
}
