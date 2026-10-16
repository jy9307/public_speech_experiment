import test from "node:test";
import assert from "node:assert/strict";
import { CHAT_STREAM_TYPE, consumeChatResponse, createChatStream } from "../app/lib/chat-stream.js";
const options = (generate, save = async (attempt) => ({ id: attempt.id })) => ({ generate, save, questionId: "question", answerId: "answer" });

test("a delta reaches the client before generation and database persistence finish", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const saved = [], events = [];
  const { response, finished } = createChatStream(options(async function* () {
    yield { text: "관찰한 근거를 " }; await gate; yield { text: "확인해 보세요." };
  }, async (attempt) => { saved.push(attempt); return { id: attempt.id }; }));
  let first;
  const firstDelta = new Promise((resolve) => { first = resolve; });
  const reading = consumeChatResponse(response, (event) => { events.push(event); if (event.type === "delta") first(); });
  await firstDelta;
  assert.equal(saved.length, 0);
  assert.equal(events.some((e) => e.type === "done"), false);
  release();
  const result = await reading; await finished;
  assert.equal(result.response, "관찰한 근거를 확인해 보세요.");
  assert.equal(saved[0].status, "completed");
  assert.ok(saved[0].firstTokenAt);
  assert.equal(response.headers.get("x-accel-buffering"), "no");
});

test("leaving the screen cancels delivery but still saves the generated answer", async () => {
  const saved = [];
  const { response, finished } = createChatStream(options(async function* () {
    yield { text: "첫 부분" }; await new Promise((r) => setTimeout(r, 5)); yield { text: "과 나머지" };
  }, async (attempt) => { saved.push(attempt); return { id: attempt.id }; }));
  const reader = response.body.getReader(); await reader.read(); await reader.cancel(); await finished;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].content, "첫 부분과 나머지");
  assert.equal(saved[0].status, "completed");
});

test("a provider failure persists partial text and never sends completion", async () => {
  const saved = [], events = [];
  const { response, finished } = createChatStream(options(async function* () {
    yield { text: "일부 답변" }; throw new Error("provider error");
  }, async (attempt) => { saved.push(attempt); return { id: attempt.id }; }));
  await assert.rejects(consumeChatResponse(response, (event) => events.push(event)), /중단/); await finished;
  assert.equal(saved[0].status, "failed"); assert.equal(saved[0].content, "일부 답변");
  assert.equal(events.some((e) => e.type === "done"), false);
});

test("UTF-8 text survives arbitrary network byte boundaries", async () => {
  const bytes = new TextEncoder().encode('{"type":"delta","text":"한글 📝"}\n{"type":"done","response":"한글 📝","id":"a","questionId":"q"}\n');
  const response = new Response(new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); c.close(); } }), { headers: { "content-type": CHAT_STREAM_TYPE } });
  const events = []; const result = await consumeChatResponse(response, (event) => events.push(event));
  assert.equal(events[0].text, "한글 📝"); assert.equal(result.response, "한글 📝");
});

test("a dropped connection is not mistaken for a completed answer", async () => {
  const response = new Response('{"type":"delta","text":"일부"}\n', { headers: { "content-type": CHAT_STREAM_TYPE } });
  await assert.rejects(consumeChatResponse(response, () => {}), /중단/);
});

test("replayed JSON replies and pre-stream HTTP errors remain supported", async () => {
  const result = await consumeChatResponse(Response.json({ id: "a", questionId: "q", response: "저장된 답변" }), () => {});
  assert.equal(result.response, "저장된 답변");
  await assert.rejects(consumeChatResponse(Response.json({ error: "다시 시도" }, { status: 409 }), () => {}), /다시 시도/);
});
