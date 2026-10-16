"use client";
import { useVideoTelemetry } from "../lib/useVideoTelemetry";
import { useEffect, useRef, useState } from "react";
import { beginRecording, saveChunk, finishRecording, recoverRecording, clearRecording } from "../lib/recording-store";
const MAX_BYTES = 100 * 1024 * 1024;
const time = (n) => `${String(Math.floor(n / 60)).padStart(2,"0")}:${String(n % 60).padStart(2,"0")}`;
export default function Recorder({ round, onStart, onUploaded, telemetry }) {
  const preview = useRef(null), stream = useRef(null), recorder = useRef(null), chunks = useRef([]),
    started = useRef(0), mounted = useRef(true), bytes = useRef(0), draft = useRef(null),
    storage = useRef(Promise.resolve()), storageFailed = useRef(false), audio = useRef(null);
  const [status,setStatus] = useState("restoring"), [error,setError] = useState(""),
    [seconds,setSeconds] = useState(0), [recording,setRecording] = useState(null),
    [mic,setMic] = useState(0), [retake,setRetake] = useState(false), [reason,setReason] = useState("");
  const videoEvents = useVideoTelemetry(telemetry, round.id, "before_upload");
  function storageError() {
    storageFailed.current = true;
    if (mounted.current) setError("영상 임시 저장을 사용할 수 없습니다. 이 창을 닫거나 새로고침하지 말고 영상을 전송해 주세요.");
  }
  function persist(fn) { storage.current = storage.current.then(fn).catch(storageError); }
  function stopDevices() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (audio.current) { void audio.current.close(); audio.current = null; }
  }
  useEffect(() => {
    mounted.current = true;
    recoverRecording(round.id).then((saved) => {
      if (!mounted.current) return;
      if (saved?.blob.size) {
        setRecording({...saved, url: URL.createObjectURL(saved.blob)});
        setStatus("review");
        telemetry.emit("recording_recovered", { attemptId: saved.attemptId, complete: saved.complete, durationMs:saved.durationMs });
      } else setStatus("ready");
    }).catch(() => { storageError(); if (mounted.current) setStatus("ready"); });
    return () => {
      mounted.current = false;
      if (recorder.current?.state === "recording") { recorder.current.onstop = null; recorder.current.stop(); }
      stopDevices();
    };
  }, [round.id]);
  useEffect(() => {
    if (status !== "recording") return;
    const timer = setInterval(() => setSeconds(Math.floor((performance.now()-started.current)/1000)),250);
    return () => clearInterval(timer);
  }, [status]);
  useEffect(() => {
    if (["recording","checking"].includes(status) && preview.current) {
      preview.current.srcObject = stream.current;
      void preview.current.play().catch(() => {});
    }
  }, [status]);
  useEffect(() => () => { if(recording?.url) URL.revokeObjectURL(recording.url); },[recording]);
  useEffect(() => {
    if (status !== "recording" && !recording) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload",warn);
    return () => window.removeEventListener("beforeunload",warn);
  }, [status,recording]);
  async function getMedia() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw Error("이 브라우저는 녹화를 지원하지 않습니다. 최신 Chrome 또는 Edge를 사용해 주세요.");
    if (stream.current?.getTracks().every((track) => track.readyState === "live")) return stream.current;
    const media = await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480}},audio:true});
    if(!mounted.current) { media.getTracks().forEach((t)=>t.stop()); throw Error("녹화 화면이 닫혔습니다."); }
    stream.current = media; return media;
  }
  function deviceError(e) {
    stopDevices(); setStatus("ready");
    setError(e.name === "NotAllowedError" ? "카메라와 마이크 권한을 허용한 뒤 다시 시작해 주세요." : e.name === "NotFoundError" ? "카메라와 마이크를 연결한 뒤 다시 시도해 주세요." : e.message);
  }
  async function checkDevices() {
    setError(""); setStatus("permission");
    try {
      const media = await getMedia();
      setStatus("checking"); telemetry.emit("device_check",{action:"start"});
      const ac = new AudioContext(); audio.current = ac; await ac.resume();
      const source = ac.createMediaStreamSource(media), analyser = ac.createAnalyser();
      source.connect(analyser); const data = new Uint8Array(analyser.fftSize);
      const update = () => {
        if(audio.current !== ac || !mounted.current) return;
        analyser.getByteTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((sum,n) => sum+((n-128)/128)**2,0)/data.length);
        setMic(Math.min(100,Math.round(rms*400))); requestAnimationFrame(update);
      }; update();
    } catch(e) { deviceError(e); }
  }
  async function begin() {
    setError(""); setStatus("permission");
    try {
      const media = await getMedia();
      const mime = ["video/webm;codecs=vp8,opus","video/webm","video/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(media,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:700000,audioBitsPerSecond:64000});
      if (!(await onStart())) { stopDevices(); setStatus(recording ? "review":"ready"); return; }
      if(!mounted.current) {stopDevices();return;}
      if(audio.current) {void audio.current.close();audio.current=null;}
      if(recording) telemetry.emit("recording_retake",{reason,previousAttemptId:recording.attemptId});
      setRecording(null);setRetake(false);chunks.current=[];bytes.current=0;storageFailed.current=false;
      const startedAt = new Date().toISOString();
      draft.current={roundId:round.id,attemptId:crypto.randomUUID(),mimeType:r.mimeType,startedAt,endedAt:startedAt,durationMs:1,complete:false};
      persist(() => beginRecording({...draft.current}));
      let index=0;
      r.ondataavailable = (e) => {
        if(!e.data.size)return;
        chunks.current.push(e.data);bytes.current+=e.data.size;
        const snapshot={...draft.current,endedAt:new Date().toISOString(),durationMs:Math.max(1,Math.round(performance.now()-started.current))};
        const part=index++;persist(() => saveChunk(snapshot,part,e.data));
        if(bytes.current>MAX_BYTES-1024*1024 && r.state === "recording")r.stop();
      };
      r.onerror=()=>{
        setError("녹화 장치 오류가 발생했습니다. 저장된 영상을 확인하거나 기술적 사유로 다시 녹화해 주세요.");
        telemetry.emit("recording_error",{reason:"media_recorder",attemptId:draft.current.attemptId});
        if(r.state === "recording")r.stop();
      };
      r.onstop=async()=>{
        stopDevices();
        const snapshot={...draft.current,endedAt:new Date().toISOString(),durationMs:Math.max(1,Math.round(performance.now()-started.current)),complete:true};
        persist(()=>finishRecording(snapshot));await storage.current;
        if(!mounted.current)return;
        const blob=new Blob(chunks.current,{type:r.mimeType});
        if(!blob.size){setError("녹화된 영상이 없습니다. 다시 시작해 주세요.");setStatus("ready");return;}
        telemetry.emit("recording_stopped",{attemptId:snapshot.attemptId,durationMs:snapshot.durationMs,endedAt:snapshot.endedAt});
        setRecording({...snapshot,blob,url:URL.createObjectURL(blob)});setStatus("review");
      };
      media.getTracks().forEach((track)=>track.addEventListener("ended",()=>{
        if(r.state === "recording") {telemetry.emit("recording_error",{reason:"device_disconnected",attemptId:draft.current.attemptId});setError("카메라 또는 마이크 연결이 끊겼습니다. 녹화된 부분을 확인해 주세요.");r.stop();}
      }));
      recorder.current=r;started.current=performance.now();r.start(1000);setSeconds(0);setStatus("recording");
      telemetry.emit("recording_started",{attemptId:draft.current.attemptId,startedAt});
    }catch(e){deviceError(e);}
  }
  async function upload() {
    setStatus("uploading");setError("");
    try {
      const uploadStartedAt=new Date().toISOString(),form=new FormData();
      form.set("roundId",round.id);form.set("durationMs",String(recording.durationMs));
      form.set("recordingStartedAt",recording.startedAt);form.set("recordingEndedAt",recording.endedAt);form.set("uploadStartedAt",uploadStartedAt);
      form.set("video",recording.blob,`round-${round.number}.${recording.blob.type.includes("mp4")?"mp4":"webm"}`);
      telemetry.emit("upload_start",{attemptId:recording.attemptId,uploadStartedAt});
      const response=await fetch("/api/recording",{method:"POST",body:form}),data=await response.json();
      if(!response.ok)throw Error(data.error);
      telemetry.emit("upload_complete",{attemptId:recording.attemptId});
      // Hand off the Blob before unmount revokes this component's preview URL.
      // The parent owns a separate URL through analysis and feedback review.
      await onUploaded(recording.blob);
      await clearRecording(round.id).catch(()=>{});
    }catch(e){setStatus("review");setError(e.message || "업로드하지 못했습니다. 영상을 다시 전송해 주세요.");}
  }
  return <section className={`recording-surface ${status === "recording"?"is-recording":""}`} aria-label="발표 녹화">
    {status === "recording" ? <>
      <div className="recording-toolbar"><span><i aria-hidden="true"/> 녹화 중</span><time aria-label="녹화 경과 시간">{time(seconds)}</time><button type="button" onClick={()=>{if(recorder.current?.state === "recording")recorder.current.stop();}}>발표 종료</button></div>
      <video ref={preview} className="webcam-preview" aria-label="웹캠 미리보기" autoPlay muted playsInline/>
      <h1 className="sr-only">{round.number}번째 발표 녹화 중</h1>
    </> : <div className="recording-card">
      {status === "restoring" ? <p>임시 저장한 영상을 확인하고 있습니다…</p> : !recording ? <>
        <h2>{round.number}번째 발표를 시작할 준비가 되었나요?</h2>
        <p>시작하면 카메라와 마이크로 발표가 녹화됩니다.</p>
        {round.state === "recording" && <p>이전 녹화가 중단되었습니다. 복구할 영상이 없으면 이번 회차를 다시 녹화해 주세요.</p>}
        {status === "checking" && <div className="device-check"><video ref={preview} autoPlay muted playsInline aria-label="점검용 카메라 미리보기"/><label>마이크 입력 <meter aria-label="마이크 입력 수준" min="0" max="100" value={mic}/></label><p>화면에 얼굴이 보이는지, 말할 때 마이크 입력 막대가 움직이는지 확인해 주세요. 점검 영상은 전송되지 않습니다.</p><button type="button" onClick={()=>{telemetry.emit("device_check",{action:"end"});stopDevices();setStatus("ready");}}>점검 마치기</button></div>}
        <div className="recording-review-actions">
          {status !== "checking" && <button type="button" className="btn-outline" disabled={status === "permission"} onClick={checkDevices}>카메라와 마이크 점검</button>}
          <button className="sense-primary" type="button" disabled={status === "permission"} onClick={begin}>{status === "permission"?"카메라 연결 중…":`${round.number}번째 발표 시작`}</button>
        </div>
      </> : <>
        <h2>녹화를 마쳤습니다.</h2>
        {!recording.complete && <p role="alert">중단 전에 임시 저장한 영상을 복구했습니다. 내용을 확인하거나 기술적 사유로 다시 녹화해 주세요.</p>}
        <video {...videoEvents} src={recording.url} controls playsInline aria-label="업로드 전 녹화 확인"/>
        <p>{time(Math.floor(recording.durationMs/1000))} 녹화. 영상을 전송하면 분석을 시작합니다. 전송 전에 창을 닫지 마세요.</p>
        <div className="recording-review-actions"><button className="sense-primary" type="button" disabled={status === "uploading"} onClick={upload}>{status === "uploading"?"영상 전송 중…":"영상 전송하고 분석하기"}</button><a href={recording.url} download={`round-${round.number}.${recording.blob.type.includes("mp4")?"mp4":"webm"}`}>영상 내려받기</a><button type="button" className="btn-outline" disabled={status === "uploading"} onClick={()=>setRetake(true)}>기술적 문제로 다시 녹화</button></div>
        {retake && <div className="retake-reason"><label>재촬영 사유<select aria-label="재촬영 사유" value={reason} onChange={(e)=>setReason(e.target.value)}><option value="">사유 선택</option><option value="camera_or_microphone">카메라 또는 마이크 문제</option><option value="interrupted">녹화 중단</option><option value="other_device_issue">기타 장치 문제</option></select></label><p>다시 시작하면 현재 영상의 임시 저장본이 교체되고 재촬영 시도가 기록됩니다.</p><button type="button" disabled={!reason} onClick={begin}>사유를 기록하고 다시 시작</button><button type="button" onClick={()=>setRetake(false)}>현재 영상 유지</button></div>}
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>}
  </section>;
}
