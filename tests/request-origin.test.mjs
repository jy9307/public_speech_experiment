import test from "node:test";
import assert from "node:assert/strict";
import { sameOriginRequest } from "../app/lib/request-origin.js";

test("proxy requests use the explicitly configured public origin", () => {
  const previous = process.env.STUDY_APP_ORIGIN;
  process.env.STUDY_APP_ORIGIN = "https://study.example.test";
  try {
    const request = (origin) => new Request("http://0.0.0.0:3000/api/study", {
      headers: { origin },
    });
    assert.equal(sameOriginRequest(request("https://study.example.test")), true);
    assert.equal(sameOriginRequest(request("https://untrusted.example.test")), false);
    assert.equal(sameOriginRequest(request("https://study.example.test.evil.test")), false);
  } finally {
    if (previous === undefined) delete process.env.STUDY_APP_ORIGIN;
    else process.env.STUDY_APP_ORIGIN = previous;
  }
});

test("development defaults to the request URL and allows missing Origin", () => {
  const previous = process.env.STUDY_APP_ORIGIN;
  delete process.env.STUDY_APP_ORIGIN;
  try {
    assert.equal(sameOriginRequest(new Request("http://localhost:3000/api/study", {
      headers: { origin: "http://localhost:3000" },
    })), true);
    assert.equal(sameOriginRequest(new Request("http://localhost:3000/api/study", {
      headers: { origin: "http://evil.test" },
    })), false);
    assert.equal(sameOriginRequest(new Request("http://localhost:3000/api/study")), true);
  } finally {
    if (previous !== undefined) process.env.STUDY_APP_ORIGIN = previous;
  }
});
