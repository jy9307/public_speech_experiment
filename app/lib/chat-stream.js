const encoder = new TextEncoder();
export const CHAT_STREAM_TYPE = "application/x-ndjson";
export const CHAT_STREAM_ERROR = "AI 응답이 중단되었거나 저장되지 않았습니다. 질문은 기록되었습니다. 잠시 후 같은 질문을 다시 전송해 주세요.";

export async function generateChatReply({ generate, save, send, questionId, answerId }) {
  const startedAt = new Date().toISOString();
  let content = "", firstTokenAt = null;
  send({ type: "start", questionId, id: answerId });
  try {
    for await (const chunk of await generate()) {
      if (chunk.text) {
        firstTokenAt ||= new Date().toISOString();
        content += chunk.text;
        send({ type: "delta", text: chunk.text });
      }
      const reason = chunk.candidates?.[0]?.finishReason;
      if (reason && reason !== "STOP") throw new Error("incomplete_response");
    }
    if (!content.trim()) throw new Error("empty_response");
    const at = new Date().toISOString();
    const saved = await save({ id: answerId, content, status: "completed", startedAt, firstTokenAt, endedAt: at });
    const result = { response: content, id: saved.id, questionId, at };
    send({ type: "done", ...result });
    return result;
  } catch {
    try {
      await save({ id: answerId, content, status: "failed", startedAt, firstTokenAt, endedAt: new Date().toISOString() });
    } catch { console.error("[chat] Failed to persist interrupted response"); }
    send({ type: "error", error: CHAT_STREAM_ERROR });
    return { error: CHAT_STREAM_ERROR };
  }
}

export function createChatStream(options) {
  let connected = true, finish;
  const finished = new Promise((resolve) => { finish = resolve; });
  const stream = new ReadableStream({
    start(controller) {
      const send = (event) => {
        if (!connected) return;
        try { controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); }
        catch { connected = false; }
      };
      void generateChatReply({ ...options, send }).finally(() => {
        if (connected) { connected = false; controller.close(); }
        finish();
      });
    },
    // Finish and persist this bounded generation even if the learner changes tabs.
    cancel() { connected = false; },
  });
  return {
    response: new Response(stream, { headers: {
      "Content-Type": `${CHAT_STREAM_TYPE}; charset=utf-8`,
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    } }),
    finished,
  };
}

export async function consumeChatResponse(response, onEvent) {
  if (!response.headers.get("content-type")?.includes(CHAT_STREAM_TYPE)) {
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || CHAT_STREAM_ERROR);
    onEvent({ type: "done", ...data });
    return data;
  }
  if (!response.ok || !response.body) throw new Error(CHAT_STREAM_ERROR);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", completed = null;
  const accept = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "error") throw new Error(event.error || CHAT_STREAM_ERROR);
    if (event.type === "done") completed = event;
    onEvent(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n")) !== -1) {
        accept(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      }
      if (done) break;
    }
    if (buffer.trim()) accept(buffer);
    if (!completed) throw new Error(CHAT_STREAM_ERROR);
    return completed;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
