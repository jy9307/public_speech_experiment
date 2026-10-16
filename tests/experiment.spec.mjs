import { test, expect } from "@playwright/test";
import nextEnv from "@next/env";
import { randomUUID } from "node:crypto";
import { database, transaction } from "../app/lib/db.js";
nextEnv.loadEnvConfig(process.cwd());
const areas = ["내용", "조직", "표현 및 전달"],
  senseFields = ["비교", "설명", "비판적 판단"],
  planFields = ["목표 설정", "전략 구체화"];
const created = [];
// Chromium virtual camera and microphone are enabled in playwright.config.mjs.
// Use those live tracks so short MediaRecorder recordings contain actual frames.

async function fixture(condition) {
  const id = `qa_${condition}_${randomUUID().slice(0, 8)}`;
  await database().query(
    "INSERT INTO speech_experiment.assignments(participant_id,condition,is_test) VALUES($1,$2,true)",
    [id, condition],
  );
  created.push(id);
  return id;
}
async function login(page, id, condition) {
  await page.goto("/");
  await page.getByLabel("참여자 아이디").fill(id);
  await page.getByRole("button", { name: "시작하기", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${condition}$`));
  await expect(
    page.getByRole("button", { name: "1번째 발표 시작", exact: true }),
  ).toBeVisible();
}
async function record(page, n) {
  await page
    .getByRole("button", { name: `${n}번째 발표 시작`, exact: true })
    .click();
  await expect(page.getByLabel("웹캠 미리보기")).toBeVisible();
  await expect(page.getByLabel("녹화 경과 시간")).toHaveText(/00:0[1-9]/);
  await page.getByRole("button", { name: "발표 종료", exact: true }).click();
  await expect(page.getByLabel("업로드 전 녹화 확인")).toBeVisible();
  await page
    .getByRole("button", { name: "영상 전송하고 분석하기", exact: true })
    .click();
  const review = page.getByLabel("분석 대기 중 나의 발표 영상");
  await expect(review).toBeVisible();
  await expect(review).toHaveAttribute("src", /^blob:/);
  const localSource=await review.getAttribute("src");
  await expect
    .poll(() => review.evaluate((video) => video.readyState))
    .toBeGreaterThanOrEqual(1);
  await review.evaluate((video) => {
    video.muted = true;
    return video.play();
  });
  await expect
    .poll(() => review.evaluate((video) => video.currentTime))
    .toBeGreaterThan(0);
  if (n < 5) {
    const continueButton = page.getByRole("button", {
      name: "피드백 확인하기",
      exact: true,
    });
    await expect(continueButton).toBeVisible();
    await expect(review).toBeVisible();
    await continueButton.click();
    await expect(page.getByRole("tab")).toHaveCount(3);
    await expect(page.getByLabel("나의 발표 녹화 영상")).toHaveAttribute("src", localSource);
  } else {
    await expect(page.getByRole("status")).toHaveText("마지막 발표 분석을 마쳤습니다.");
    await page
      .getByRole("button", { name: "활동 마치기", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "5회의 발표를 모두 마쳤습니다." }),
    ).toBeVisible();
  }
}
async function fill(page, stage) {
  for (let i = 0; i < 3; i++) {
    const area = areas[i];
    await page.getByRole("tab", { name: new RegExp(`^${area}`) }).click();
    for (const field of stage === "sense" ? senseFields : planFields)
      await page
        .getByLabel(`${area} ${field}`, { exact: true })
        .fill(`${area} ${field}: 실제 근거와 다음 발표 계획 ${i}`);

  }
}
test.afterAll(async () => {
  await transaction(async (client) => {
    for (const id of created) {
      await client.query(
        "DELETE FROM speech_experiment.chat_messages WHERE round_id IN (SELECT id FROM speech_experiment.rounds WHERE participant_id=$1) AND role='assistant'",
        [id],
      );
      for (const table of [
        "chat_messages",
        "response_revisions",
        "responses",
        "screen_visits",
        "events",
        "recordings",
      ])
        await client.query(
          `DELETE FROM speech_experiment.${table} WHERE round_id IN (SELECT id FROM speech_experiment.rounds WHERE participant_id=$1)`,
          [id],
        );
      await client.query(
        "DELETE FROM speech_experiment.rounds WHERE participant_id=$1",
        [id],
      );
      await client.query(
        "DELETE FROM speech_experiment.participants WHERE id=$1",
        [id],
      );
      await client.query(
        "DELETE FROM speech_experiment.assignments WHERE participant_id=$1",
        [id],
      );
    }
  });
  await database().end();
});
test("five presentations, real browser recordings, server responses and research metrics", async ({
  page,
}) => {
  const id = await fixture("control");
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/experiment");
  await expect(page).toHaveURL(/\/$/);
  await page.getByLabel("참여자 아이디").fill("unknown");
  await page.getByRole("button", { name: "시작하기", exact: true }).click();
  await expect(page.locator("#login-error")).toContainText("등록되지 않은");
  await login(page, id, "control");
  for (let n = 1; n <= 5; n++) {
    if (n > 1) {
      await expect(
        page.getByRole("heading", { name: "다음 발표를 위한 나의 행동계획" }),
      ).toBeVisible();
      await expect(page.locator(".previous-plan")).toContainText(
        "실제 근거와 다음 발표 계획",
      );
    }
    await record(page, n);
    if (n === 5) break;
    await expect(
      page.getByRole("complementary", { name: "AI 대화", exact: true }),
    ).toHaveCount(0);
    const state = await (await page.request.get("/api/study")).json();
    const premature = await page.request.post("/api/study", {
      data: { roundId: state.round.id, action: "next" },
    });
    expect(premature.status()).toBe(409);
    if (n === 1) {
      const rubricButton = page.getByRole("button", {
        name: "발표 내용의 적절성 루브릭 보기",
        exact: true,
      });
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await rubricButton.hover();
      await expect(page.getByRole("tooltip")).toContainText(
        "발표 주제에 대해 적절한 핵심 내용을 제시하였다.",
      );
      await expect(page.getByRole("tooltip")).toContainText(
        "발표 주제에 대한 핵심 내용이 정확하게 제시되어 있음.",
      );
      await expect(page.getByRole("tooltip")).toContainText(
        "발표 주제에 대한 핵심 내용을 충분히 다루지 못함.",
      );
      await expect(page.getByRole("tooltip")).not.toContainText(/[1-4]점/);
      await expect(page.getByRole("tooltip").locator("section")).toHaveCount(1);
      await expect(page.getByLabel("내용 우선순위", {exact:true})).toHaveCount(0);
      expect(
        state.round.feedback.every(
          (f) => !Object.hasOwn(f, "score") && !Object.hasOwn(f, "scores"),
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await rubricButton.focus();
      await expect(page.getByRole("tooltip")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(".feedback-narrative")).toContainText(
        "실제 사례 한 가지",
      );
      await expect(
        page.locator(".sense-feedback details, .feedback-solution"),
      ).toHaveCount(0);
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: "test-results/study-control-mobile.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    const roundSource=await page.getByLabel("나의 발표 녹화 영상").getAttribute("src");
    await fill(page, "sense");
    await page
      .getByLabel("표현 및 전달 비판적 판단", { exact: true })
      .fill("수정한 판단: 구체적인 근거를 다시 기록했습니다.");
    await page
      .getByRole("button", { name: "행동계획으로 →", exact: true })
      .click();
    await expect(
      page.getByLabel("표현 및 전달 목표 설정", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("나의 발표 녹화 영상")).toHaveAttribute("src", roundSource);
    if (n === 1) {
      await page.reload();
      await expect(page.getByLabel("나의 발표 녹화 영상")).toHaveAttribute("src", /^\/api\/recording\//);
      await expect(
        page.getByLabel("내용 목표 설정", { exact: true }),
      ).toBeVisible();
    }
    await fill(page, "plan");
    await page
      .getByRole("button", { name: "다음 발표 넘어가기", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: `${n + 1}번째 발표 시작`, exact: true }),
    ).toBeVisible();
  }
  const rows = (
    await database().query(
      "SELECT * FROM speech_experiment.round_metrics WHERE participant_id=$1 ORDER BY number",
      [id],
    )
  ).rows;
  expect(rows).toHaveLength(5);
  expect(rows.every((r) => r.completed && r.is_test)).toBe(true);
  expect(rows.every((r) => r.timing_version === 2 && r.recording_started_at && r.upload_received_at && r.analysis_completed_at)).toBe(true);
  expect(rows.every((r) => r.recording_started_at <= r.recording_ended_at && r.recording_ended_at <= r.upload_started_at)).toBe(true);
  expect(rows[4].participant_finished_at).toBeTruthy();
  expect(rows[4].analysis_completed_at <= rows[4].participant_finished_at).toBe(true);
  const eventTypes = (await database().query("SELECT DISTINCT type FROM speech_experiment.events e JOIN speech_experiment.rounds r ON r.id=e.round_id WHERE participant_id=$1", [id])).rows.map((r)=>r.type);
  for(const type of ["recording_started","recording_stopped","upload_start","upload_complete","video_play","video_review_end","rubric_open","rubric_close"])expect(eventTypes).toContain(type);
  const snapshots = (await database().query(
    "SELECT number,analysis,feedback FROM speech_experiment.rounds WHERE participant_id=$1 ORDER BY number", [id],
  )).rows;
  for (const [index, row] of snapshots.entries()) {
    expect(row.analysis.pipeline).toBe("grouped-criterion-algorithmic");
    expect(row.analysis.context.materials.text).toContain("세온 호수");
    expect(row.analysis.context.roundNumber).toBe(row.number);
    if (index === 0) expect(row.analysis.context.previousRound).toBeNull();
    else {
      const previous = row.analysis.context.previousRound;
      expect(previous.number).toBe(row.number - 1);
      expect(previous.feedback.map((f) => f.text)).toEqual(snapshots[index - 1].feedback.map((f) => f.text));
      expect(previous.feedback.every((f) => Object.keys(f).sort().join(",") === "categoryId,rubricItemId,text")).toBe(true);
    }
  }
  expect(
    rows
      .slice(0, 4)
      .every(
        (r) => Number(r.sense_active_ms) > 0 && Number(r.plan_active_ms) > 0,
      ),
  ).toBe(true);
  const counts = (
    await database().query(
      "SELECT count(*) AS n FROM speech_experiment.response_revisions v JOIN speech_experiment.rounds r ON r.id=v.round_id WHERE participant_id=$1",
      [id],
    )
  ).rows[0];
  expect(Number(counts.n)).toBeGreaterThan(60);
  expect(errors).toEqual([]);
});
test("experimental chat error recovery and participant data isolation", async ({
  page,
  browser,
}) => {
  const id = await fixture("experiment");
  await login(page, id, "experiment");
  await record(page, 1);
  await page.route("**/api/chat", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 502,
          json: { error: "질문은 기록되었습니다. 다시 시도해 주세요." },
        })
      : route.continue(),
  );
  await page.getByLabel("AI에게 보낼 메시지").fill("어떤 근거가 필요한가요?");
  await page.getByRole("button", { name: "메시지 보내기" }).click();
  await expect(page.locator(".chat-error")).toContainText("다시 시도");
  await page.unroute("**/api/chat");
  const context = await browser.newContext();
  const other = await context.newPage();
  const otherId = await fixture("control");
  await login(other, otherId, "control");
  const state = await (await page.request.get("/api/study")).json();
  const denied = await other.request.get(`/api/recording/${state.round.id}`);
  expect(denied.status()).toBe(404);
  const blocked = await other.request.post("/api/chat", {
    data: { message: "질문" },
  });
  expect(blocked.status()).toBe(403);
  await context.close();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/study-experiment-mobile.png",
    fullPage: true,
  });
});
test("denied webcam permission leaves the round ready and allows retry", async ({
  page,
}) => {
  const id = await fixture("control");
  await login(page, id, "control");
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
  });
  await page
    .getByRole("button", { name: "1번째 발표 시작", exact: true })
    .click();
  await expect(page.locator(".recording-card [role=alert]")).toContainText(
    "권한",
  );
  const state = await (await page.request.get("/api/study")).json();
  expect(state.round.state).toBe("ready");
});

test("device check, local recording recovery, technical retake and chat drafts", async ({ page }) => {
  page.on("dialog", (dialog)=>dialog.accept());
  const id=await fixture("experiment");
  await login(page,id,"experiment");
  await expect(page.getByLabel("실험 진행 안내")).toContainText("별도로 제공한 발표 자료");
  await page.getByRole("button",{name:"카메라와 마이크 점검",exact:true}).click();
  await expect(page.getByLabel("점검용 카메라 미리보기")).toBeVisible();
  await expect(page.getByLabel("마이크 입력 수준")).toBeVisible();
  await page.screenshot({path:"test-results/device-check-desktop.png",fullPage:true});
  expect((await (await page.request.get("/api/study")).json()).round.state).toBe("ready");
  await page.getByRole("button",{name:"점검 마치기",exact:true}).click();
  await page.getByRole("button",{name:"1번째 발표 시작",exact:true}).click();
  await expect(page.getByLabel("녹화 경과 시간")).toHaveText(/00:0[2-9]/);
  await page.getByRole("button",{name:"발표 종료",exact:true}).click();
  await expect(page.getByLabel("업로드 전 녹화 확인")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("업로드 전 녹화 확인")).toBeVisible();
  await page.getByRole("button",{name:"기술적 문제로 다시 녹화",exact:true}).click();
  await expect(page.getByRole("button",{name:"사유를 기록하고 다시 시작",exact:true})).toBeDisabled();
  await page.getByLabel("재촬영 사유").selectOption("camera_or_microphone");
  await page.getByRole("button",{name:"사유를 기록하고 다시 시작",exact:true}).click();
  await expect(page.getByLabel("녹화 경과 시간")).toHaveText(/00:0[2-9]/);
  await page.reload();
  await expect(page.getByLabel("업로드 전 녹화 확인")).toBeVisible();
  await expect(page.locator(".recording-card [role=alert]")).toContainText("임시 저장한 영상을 복구");
  const recoveredVideo=page.getByLabel("업로드 전 녹화 확인");
  await expect.poll(()=>recoveredVideo.evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(1);
  await recoveredVideo.evaluate(v=>{v.muted=true;return v.play();});
  await expect.poll(()=>recoveredVideo.evaluate(v=>v.currentTime)).toBeGreaterThan(0);
  await recoveredVideo.evaluate(v=>v.pause());
  await page.getByRole("button",{name:"영상 전송하고 분석하기",exact:true}).click();
  await page.getByRole("button",{name:"피드백 확인하기",exact:true}).click();
  await page.getByLabel("AI에게 보낼 메시지").fill("작성 중인 질문입니다.");
  await page.getByRole("tab",{name:/^조직/}).click();
  await page.getByRole("tab",{name:/^내용/}).click();
  await expect(page.getByLabel("AI에게 보낼 메시지")).toHaveValue("작성 중인 질문입니다.");
  await page.reload();
  await expect(page.getByLabel("AI에게 보낼 메시지")).toHaveValue("작성 중인 질문입니다.");
  const state=await (await page.request.get("/api/study")).json();
  const count=(await database().query("SELECT recording_attempts FROM speech_experiment.rounds WHERE id=$1",[state.round.id])).rows[0];
  expect(count.recording_attempts).toBe(2);
  const retryLogs=(await database().query("SELECT type FROM speech_experiment.events WHERE round_id=$1 AND type IN ('recording_retake','recording_recovered')",[state.round.id])).rows.map(r=>r.type);
  expect(retryLogs).toContain("recording_retake");expect(retryLogs).toContain("recording_recovered");
  const saved=await page.evaluate(async roundId=>{
    return new Promise(resolve=>{const r=indexedDB.open('speech-recordings-v1',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('drafts'),q=t.objectStore('drafts').get(roundId);q.onsuccess=()=>resolve(q.result??null);t.oncomplete=()=>db.close();};});
  },state.round.id);
  expect(saved).toBeNull();
});

test("chat request replay reuses stored question and answer",async({page})=>{
  const id=await fixture("experiment");await login(page,id,"experiment");await record(page,1);
  const state=await(await page.request.get('/api/study')).json();
  const requestId=randomUUID(),answerId=randomUUID();
  const {reserveChatQuestion}=await import('../app/lib/chat-requests.js');
  const request={roundId:state.round.id,area:'content',stage:'sense',message:'같은 질문',clientAt:new Date().toISOString(),requestId,context:{stage:'sense',activeQuestion:'comparison'}};
  const reserved=await reserveChatQuestion(request),questionId=reserved.question.id;
  await expect(reserveChatQuestion(request)).rejects.toMatchObject({status:409});
  await database().query("UPDATE speech_experiment.chat_messages SET status='failed' WHERE id=$1",[questionId]);
  expect((await reserveChatQuestion(request)).question.id).toBe(questionId);
  await database().query("INSERT INTO speech_experiment.chat_messages(id,round_id,area,stage,role,content,client_at,reply_to) VALUES($1,$2,'content','sense','assistant','저장된 답변',now(),$3)",[answerId,state.round.id,questionId]);
  for(let n=0;n<2;n++){
    const r=await page.request.post('/api/chat',{data:{roundId:state.round.id,area:'content',message:'같은 질문',questionId:'comparison',clientAt:new Date().toISOString(),requestId}});
    expect(r.status()).toBe(200);expect((await r.json()).id).toBe(answerId);
  }
  expect(Number((await database().query("SELECT count(*) n FROM speech_experiment.chat_messages WHERE round_id=$1 AND role='user'",[state.round.id])).rows[0].n)).toBe(1);
});


test("final activity confirmation is distinct from pending analysis", async({page})=>{
 const id=await fixture("control");await login(page,id,"control");
 await database().query("UPDATE speech_experiment.rounds SET state='completed',completed_at=now() WHERE participant_id=$1",[id]);
 for(let n=2;n<=4;n++)await database().query("INSERT INTO speech_experiment.rounds(id,participant_id,number,state,completed_at) VALUES($1,$2,$3,'completed',now())",[randomUUID(),id,n]);
 const last=randomUUID();
 await database().query("INSERT INTO speech_experiment.rounds(id,participant_id,number,state,upload_received_at,timing_version) VALUES($1,$2,5,'analyzing',now(),2)",[last,id]);
 await page.reload();
 await page.getByRole('button',{name:'활동 마치기',exact:true}).click();
 await expect(page.getByRole('heading',{name:'5회의 발표를 모두 마쳤습니다.'})).toBeVisible();
 const stored=(await database().query("SELECT state,analysis_completed_at,participant_finished_at,completed_at FROM speech_experiment.rounds WHERE id=$1",[last])).rows[0];
 expect(stored.state).toBe('analyzing');expect(stored.analysis_completed_at).toBeNull();expect(stored.participant_finished_at).toBeTruthy();expect(stored.completed_at).toBeTruthy();
 await page.reload();await expect(page.getByRole('heading',{name:'5회의 발표를 모두 마쳤습니다.'})).toBeVisible();
});


test("uploaded video reuses its local source without server video requests",async({page})=>{
  const id=await fixture("control");await login(page,id,"control");
  const requests=[];
  page.on('request',request=>{if(/\/api\/recording\//.test(request.url()))requests.push(request.url());});
  await record(page,1);
  const video=page.getByLabel('나의 발표 녹화 영상');
  const source=await video.getAttribute('src');expect(source).toMatch(/^blob:/);
  await video.evaluate(v=>{v.muted=true;return v.play();});
  await expect.poll(()=>video.evaluate(v=>v.currentTime)).toBeGreaterThan(0);
  expect(requests).toEqual([]);
  await page.reload();
  await expect(page.getByLabel('나의 발표 녹화 영상')).toHaveAttribute('src',/^\/api\/recording\//);
  await expect.poll(()=>requests.length).toBeGreaterThan(0);
  await expect.poll(()=>page.getByLabel('나의 발표 녹화 영상').evaluate(v=>v.readyState)).toBeGreaterThanOrEqual(1);
});

test("server video ranges, full streaming, cache revalidation and ownership",async({page,browser})=>{
  const id=await fixture('control');await login(page,id,'control');
  const state=await(await page.request.get('/api/study')).json();
  const size=2*1024*1024+37,bytes=Buffer.alloc(size);
  for(let i=0;i<size;i++)bytes[i]=i%251;
  await database().query("INSERT INTO speech_experiment.recordings(round_id,mime_type,duration_ms,byte_size,video) VALUES($1,'video/webm',1000,$2,$3)",[state.round.id,size,bytes]);
  const url=`/api/recording/${state.round.id}`;
  const first=await page.request.get(url,{headers:{Range:'bytes=0-'}});
  expect(first.status()).toBe(206);expect(first.headers()['content-range']).toBe(`bytes 0-1048575/${size}`);
  expect(await first.body()).toEqual(bytes.subarray(0,1048576));
  const etag=first.headers().etag;expect(first.headers()['cache-control']).toBe('private, no-cache');
  const exact=await page.request.get(url,{headers:{Range:'bytes=100-131'}});
  expect(exact.status()).toBe(206);expect(await exact.body()).toEqual(bytes.subarray(100,132));
  const tail=await page.request.get(url,{headers:{Range:'bytes=-32'}});
  expect(await tail.body()).toEqual(bytes.subarray(size-32));
  const invalid=await page.request.get(url,{headers:{Range:`bytes=${size}-`}});
  expect(invalid.status()).toBe(416);expect(invalid.headers()['content-range']).toBe(`bytes */${size}`);
  const head=await page.request.head(url);expect(head.status()).toBe(200);expect(head.headers()['content-length']).toBe(String(size));expect((await head.body()).length).toBe(0);
  const cached=await page.request.get(url,{headers:{'If-None-Match':etag}});expect(cached.status()).toBe(304);
  const full=await page.request.get(url);expect(full.status()).toBe(200);expect(await full.body()).toEqual(bytes);
  const other=await browser.newContext();const otherPage=await other.newPage();
  await login(otherPage,await fixture('control'),'control');
  expect((await otherPage.request.get(url,{headers:{'If-None-Match':etag}})).status()).toBe(404);
  await other.close();
});
