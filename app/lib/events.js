import { transaction } from "./db.js";
import { AREAS, FIELDS, assertStudy } from "./study.js";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TYPES = [
  "screen_enter",
  "screen_leave",
  "heartbeat",
  "click",
  "response_edit",
  "interruption",
  "visibility",
  "chat_start",
  "chat_end",
  "recording_error", "recording_started", "recording_stopped", "recording_retake", "recording_recovered", "device_check",
  "video_play", "video_pause", "video_seek", "video_end", "video_progress", "video_review_end",
  "rubric_open", "rubric_close", "upload_start", "upload_complete", "chat_question_sent", "chat_answer_received",
];
export function validateEvents(events, group) {
  assertStudy(
    Array.isArray(events) && events.length > 0 && events.length <= 100,
    "기록 형식이 올바르지 않습니다.",
    400,
  );
  for (const e of events) {
    assertStudy(
      e &&
        UUID.test(e.id) &&
        UUID.test(e.roundId) &&
        TYPES.includes(e.type) &&
        [
          "ready",
          "recording",
          "analyzing",
          "sense",
          "plan",
          "completed",
        ].includes(e.screen) &&
        Number.isFinite(Date.parse(e.at)) &&
        Math.abs(Date.now() - Date.parse(e.at)) < 7 * 86400000 &&
        (!e.component ||
          (typeof e.component === "string" && e.component.length <= 200)) &&
        e.payload &&
        typeof e.payload === "object" &&
        JSON.stringify(e.payload).length <= 45000,
      "기록 형식이 올바르지 않습니다.",
      400,
    );
    if (e.type === "response_edit") {
      const p = e.payload;
      assertStudy(
        ["sense", "plan"].includes(e.screen) &&
          AREAS.includes(p.area) &&
          (FIELDS[e.screen].includes(p.field) || (e.screen === "plan" && p.field === "priority")) &&
          typeof p.before === "string" &&
          typeof p.after === "string" &&
          p.before.length <= 20000 &&
          p.after.length <= 20000 &&
          (p.field !== "priority" || ["", "1", "2", "3"].includes(p.after)),
        "응답을 확인해 주세요.",
        400,
      );
    }
    if (["screen_enter", "screen_leave", "heartbeat"].includes(e.type))
      assertStudy(
        UUID.test(e.payload.visitId) &&
          Number.isInteger(e.payload.activeMs) &&
          e.payload.activeMs >= 0 &&
          e.payload.activeMs <= 86400000,
        "화면 기록을 확인해 주세요.",
        400,
      );
    if (e.type.startsWith("chat_")) {
      assertStudy(
        group === "experiment",
        "대화 기록에 접근할 수 없습니다.",
        403,
      );
      if (e.type === "chat_end")
        assertStudy(
          Number.isInteger(e.payload.durationMs) &&
            e.payload.durationMs >= 0 &&
            e.payload.durationMs <= 30000,
          "대화 시간 기록을 확인해 주세요.",
          400,
        );
    }
  }
}
export async function storeEvents(participant, events) {
  validateEvents(events, participant.group);
  return transaction(async (client) => {
    const roundIds = [...new Set(events.map((e) => e.roundId))];
    const rounds = (
      await client.query(
        "SELECT id,number,state FROM speech_experiment.rounds WHERE id=ANY($1::uuid[]) AND participant_id=$2 ORDER BY id FOR UPDATE",
        [roundIds, participant.id],
      )
    ).rows;
    assertStudy(
      rounds.length === roundIds.length,
      "회차에 접근할 수 없습니다.",
      404,
    );
    const byId = new Map(rounds.map((r) => [r.id, r]));
    const rows = events.map((e) => ({
      id: e.id,
      round_id: e.roundId,
      type: e.type,
      screen: e.screen,
      component: e.component || null,
      client_at: e.at,
      payload: e.payload,
    }));
    const inserted = await client.query(
      `INSERT INTO speech_experiment.events(id,round_id,type,screen,component,client_at,payload)
      SELECT id,round_id,type,screen,component,client_at,payload FROM jsonb_to_recordset($1::jsonb)
      AS e(id uuid,round_id uuid,type text,screen text,component text,client_at timestamptz,payload jsonb)
      ON CONFLICT(id) DO NOTHING RETURNING id`,
      [JSON.stringify(rows)],
    );
    const freshIds = new Set(inserted.rows.map((r) => r.id));
    const fresh = [
      ...new Map(
        events.filter((e) => freshIds.has(e.id)).map((e) => [e.id, e]),
      ).values(),
    ];
    const edits = fresh.filter((e) => e.type === "response_edit");
    if (edits.length) {
      for (const e of edits) {
        const r = byId.get(e.roundId);
        assertStudy(
          r.number < 5 && ["sense", "plan", "completed"].includes(r.state),
          "피드백 활동 단계에서만 응답을 저장할 수 있습니다.",
        );
      }
      const revisions = edits.map((e) => ({
        event_id: e.id,
        round_id: e.roundId,
        stage: e.screen,
        area: e.payload.area,
        field: e.payload.field,
        before_value: e.payload.before,
        after_value: e.payload.after,
        client_at: e.at,
      }));
      await client.query(
        `INSERT INTO speech_experiment.response_revisions(event_id,round_id,stage,area,field,before_value,after_value,client_at)
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS e(event_id uuid,round_id uuid,stage text,area text,field text,before_value text,after_value text,client_at timestamptz)`,
        [JSON.stringify(revisions)],
      );
      const latest = new Map();
      for (const e of edits) {
        if (byId.get(e.roundId).state === "completed") continue;
        const key = [e.roundId, e.screen, e.payload.area, e.payload.field].join(
          ":",
        );
        const prior = latest.get(key);
        if (!prior || Date.parse(prior.at) <= Date.parse(e.at))
          latest.set(key, e);
      }
      if (latest.size) {
        const values = [...latest.values()].map((e) => ({
          round_id: e.roundId,
          stage: e.screen,
          area: e.payload.area,
          field: e.payload.field,
          value: e.payload.after,
          updated_at: e.at,
          event_id: e.id,
        }));
        await client.query(
          `INSERT INTO speech_experiment.responses(round_id,stage,area,field,value,updated_at,event_id)
          SELECT * FROM jsonb_to_recordset($1::jsonb) AS e(round_id uuid,stage text,area text,field text,value text,updated_at timestamptz,event_id uuid)
          ON CONFLICT(round_id,stage,area,field) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at,event_id=EXCLUDED.event_id
          WHERE speech_experiment.responses.updated_at<=EXCLUDED.updated_at`,
          [JSON.stringify(values)],
        );
      }
    }
    const visits = new Map();
    for (const e of fresh.filter((e) =>
      ["screen_enter", "screen_leave", "heartbeat"].includes(e.type),
    )) {
      const p = e.payload,
        key = p.visitId;
      const prior = visits.get(key) || {
        id: key,
        round_id: e.roundId,
        screen: e.screen,
        started_at: null,
        last_seen_at: e.at,
        ended_at: null,
        end_reason: null,
        active_ms: 0,
      };
      assertStudy(
        prior.round_id === e.roundId && prior.screen === e.screen,
        "화면 기록이 일치하지 않습니다.",
        400,
      );
      if (
        e.type === "screen_enter" &&
        (!prior.started_at || Date.parse(e.at) < Date.parse(prior.started_at))
      )
        prior.started_at = e.at;
      if (Date.parse(e.at) > Date.parse(prior.last_seen_at))
        prior.last_seen_at = e.at;
      prior.active_ms = Math.max(prior.active_ms, p.activeMs);
      if (
        e.type === "screen_leave" &&
        (!prior.ended_at || Date.parse(e.at) > Date.parse(prior.ended_at))
      ) {
        prior.ended_at = e.at;
        prior.end_reason = p.reason || "navigation";
      }
      visits.set(key, prior);
    }
    if (visits.size) {
      const data = JSON.stringify([...visits.values()]);
      const definition =
        "e(id uuid,round_id uuid,screen text,started_at timestamptz,last_seen_at timestamptz,ended_at timestamptz,end_reason text,active_ms bigint)";
      await client.query(
        `INSERT INTO speech_experiment.screen_visits(id,round_id,screen,started_at,last_seen_at,ended_at,end_reason,active_ms)
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS ${definition} WHERE started_at IS NOT NULL ON CONFLICT(id) DO NOTHING`,
        [data],
      );
      await client.query(
        `UPDATE speech_experiment.screen_visits v SET last_seen_at=GREATEST(v.last_seen_at,e.last_seen_at),active_ms=GREATEST(v.active_ms,e.active_ms),
        ended_at=GREATEST(v.ended_at,e.ended_at),end_reason=CASE WHEN e.ended_at IS NOT NULL AND (v.ended_at IS NULL OR e.ended_at>=v.ended_at) THEN e.end_reason ELSE v.end_reason END
        FROM jsonb_to_recordset($1::jsonb) AS ${definition} WHERE v.id=e.id AND v.round_id=e.round_id AND v.screen=e.screen`,
        [data],
      );
    }
    const interruptions = fresh
      .filter((e) => e.type === "interruption")
      .map((e) => ({ round_id: e.roundId, at: e.at }));
    if (interruptions.length)
      await client.query(
        `UPDATE speech_experiment.rounds r SET interrupted_at=GREATEST(r.interrupted_at,e.at)
      FROM (SELECT round_id,max(at) AS at FROM jsonb_to_recordset($1::jsonb) AS x(round_id uuid,at timestamptz) GROUP BY round_id) e
      WHERE r.id=e.round_id AND r.state<>'completed' AND r.participant_finished_at IS NULL`,
        [JSON.stringify(interruptions)],
      );
    await client.query(
      "UPDATE speech_experiment.rounds SET last_seen_at=now() WHERE id=ANY($1::uuid[])",
      [roundIds],
    );
  });
}
