import { randomUUID } from "node:crypto";
import { transaction } from "./db.js";
import { assertStudy } from "./study.js";
export function reserveChatQuestion({ roundId, area, stage, message, clientAt, requestId, context }) {
  return transaction(async (client) => {
    await client.query(
      `INSERT INTO speech_experiment.chat_messages(id,round_id,area,stage,role,content,client_at,status,context,request_id)
       VALUES($1,$2,$3,$4,'user',$5,$6,'pending',$7,$8)
       ON CONFLICT(round_id,request_id) WHERE role='user' AND request_id IS NOT NULL DO NOTHING`,
      [randomUUID(),roundId,area,stage,message,clientAt,JSON.stringify(context),requestId],
    );
    const question = (await client.query("SELECT * FROM speech_experiment.chat_messages WHERE round_id=$1 AND request_id=$2 AND role='user' FOR UPDATE",[roundId,requestId])).rows[0];
    assertStudy(question.area === area && question.content === message, "재시도할 질문을 확인해 주세요.",400);
    const answer = (await client.query("SELECT id,content,client_at FROM speech_experiment.chat_messages WHERE reply_to=$1 AND role='assistant'",[question.id])).rows[0];
    if(answer)return {question,answer};
    const claim = await client.query("UPDATE speech_experiment.chat_messages SET status='pending',generation_started_at=now() WHERE id=$1 AND (status='failed' OR generation_started_at IS NULL OR generation_started_at<now()-interval '90 seconds') RETURNING id",[question.id]);
    assertStudy(claim.rowCount,"앞선 질문의 답변을 준비하고 있습니다. 잠시 후 같은 질문을 다시 전송해 주세요.",409);
    return {question};
  });
}
