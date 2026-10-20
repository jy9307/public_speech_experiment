import { isAdmin } from "../../../../lib/admin";
import { sameOriginRequest } from "../../../../lib/request-origin";
import { database, transaction } from "../../../../lib/db";
import { deleteStoredRecording } from "../../../../lib/recording-storage";

export const runtime = "nodejs";

export async function DELETE(request, { params }) {
  if (!sameOriginRequest(request)) return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  if (!(await isAdmin())) return Response.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  const { id } = await params;
  if (!/^[a-z0-9가-힣_-]{1,40}$/.test(id)) return Response.json({ error: "참가자 아이디가 올바르지 않습니다." }, { status: 400 });

  try {
    await transaction(async (client) => {
      await client.query("SELECT id FROM speech_experiment.participants WHERE id=$1 FOR UPDATE", [id]);
      const recordings = (await client.query(
        "SELECT rec.* FROM speech_experiment.recordings rec JOIN speech_experiment.rounds r ON r.id=rec.round_id WHERE r.participant_id=$1",
        [id],
      )).rows;
      for (const recording of recordings) await deleteStoredRecording(recording);
      await client.query("DELETE FROM speech_experiment.chat_messages WHERE round_id IN (SELECT id FROM speech_experiment.rounds WHERE participant_id=$1)", [id]);
      for (const table of ["responses", "response_revisions", "screen_visits", "events", "recordings"]) {
        await client.query(`DELETE FROM speech_experiment.${table} WHERE round_id IN (SELECT id FROM speech_experiment.rounds WHERE participant_id=$1)`, [id]);
      }
      await client.query("DELETE FROM speech_experiment.rounds WHERE participant_id=$1", [id]);
      await client.query("DELETE FROM speech_experiment.participants WHERE id=$1", [id]);
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[admin] participant deletion failed", error.code || error.name);
    return Response.json({ error: "참가자 데이터를 삭제하지 못했습니다. 저장소 연결을 확인해 주세요." }, { status: 500 });
  }
}
