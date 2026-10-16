import test from "node:test";
import assert from "node:assert/strict";
import { videoRange, videoStream, VIDEO_READ_BYTES, VIDEO_RANGE_BYTES } from "../app/lib/video-stream.js";

test("video ranges bound open requests and preserve exact, suffix and full requests", () => {
  const size=4*VIDEO_RANGE_BYTES;
  assert.deepEqual(videoRange("bytes=0-",size),{start:0,end:VIDEO_RANGE_BYTES-1,partial:true});
  assert.deepEqual(videoRange(`bytes=${VIDEO_RANGE_BYTES}-`,size),{start:VIDEO_RANGE_BYTES,end:2*VIDEO_RANGE_BYTES-1,partial:true});
  assert.deepEqual(videoRange("bytes=10-19",size),{start:10,end:19,partial:true});
  assert.deepEqual(videoRange("bytes=-32",size),{start:size-32,end:size-1,partial:true});
  assert.deepEqual(videoRange(null,size),{start:0,end:size-1,partial:false});
  assert.deepEqual(videoRange("bytes=4-999",10),{start:4,end:9,partial:true});
  for(const invalid of ["bytes=-0","bytes=-","bytes=5-4","bytes=10-","bytes=0-1,4-5","bytes=9007199254740992-"])
    assert.equal(videoRange(invalid,10),null);
});

test("streaming returns the exact bytes without any full-file database read",async()=>{
  const source=Buffer.alloc(VIDEO_READ_BYTES*2+43);
  for(let i=0;i<source.length;i++)source[i]=i%251;
  const reads=[];
  const stream=videoStream({start:5,end:source.length-8,read:async(offset,length)=>{
    reads.push({offset,length});return source.subarray(offset,offset+length);
  }});
  assert.equal(reads.length,0);
  const bytes=Buffer.from(await new Response(stream).arrayBuffer());
  assert.deepEqual(bytes,source.subarray(5,source.length-7));
  assert.equal(reads.length,3);
  assert.ok(reads.every(r=>r.length<=VIDEO_READ_BYTES));
});

test("cancelling a video request stops further database reads",async()=>{
  let calls=0;
  const stream=videoStream({start:0,end:VIDEO_READ_BYTES*4,read:async(_,length)=>{
    calls++;return Buffer.alloc(length);
  }});
  const reader=stream.getReader();await reader.read();await reader.cancel();
  assert.equal(calls,1);
});

test("abort during a database read does not enqueue footage or start another read",async()=>{
  const abort=new AbortController();let complete,started;
  const reading=new Promise(r=>{started=r;});
  let calls=0;
  const reader=videoStream({start:0,end:VIDEO_READ_BYTES*3,signal:abort.signal,read:async(_,length)=>{
    calls++;started();return new Promise(resolve=>{complete=()=>resolve(Buffer.alloc(length));});
  }}).getReader();
  const first=reader.read();await reading;abort.abort();complete();
  assert.equal((await first).done,true);assert.equal(calls,1);
});

test("a truncated database read fails instead of returning corrupt successful footage",async()=>{
  const reader=videoStream({start:0,end:100,read:async()=>Buffer.alloc(10)}).getReader();
  await assert.rejects(reader.read(),/Incomplete recording range/);
});
