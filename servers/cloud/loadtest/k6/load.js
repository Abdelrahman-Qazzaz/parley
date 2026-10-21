/**
 * Users of the app, each signed in as their own made-up user, doing what a
 * person does in a session: open the app, start a conversation, chat, and now
 * and then upload audio, wait for its transcript and ask about it. Alongside
 * them, open tabs hold GET /events the way the browser does.
 *
 *   docker compose run --rm --no-deps k6 run /scripts/load.js -e PROFILE=smoke
 *
 * PROFILE picks the shape of the run (smoke, load, stress, spike, soak).
 * AUDIO_SHARE is the fraction of sessions that upload audio (default 0.3),
 * AUDIO_KB the size of each upload (default 256) and TABS overrides how many
 * open tabs there are.
 */
import http from "k6/http";
import { check, fail, sleep } from "k6";
import { randomBytes } from "k6/crypto";
import { Rate, Trend } from "k6/metrics";

const API = __ENV.API_URL || "http://localhost:3001";
const MOCKS = __ENV.MOCKS_URL || "http://localhost:4000";
const USERS = Number(__ENV.LOADTEST_USERS || 1000);
const PROFILE = __ENV.PROFILE || "smoke";
const AUDIO_SHARE = Number(__ENV.AUDIO_SHARE ?? 0.3);
const AUDIO_KB = Number(__ENV.AUDIO_KB || 256);
const CHAT_MODEL = "loadtest/text-model";

// Each profile: how the active users ramp, and how many idle tabs hold
// GET /events open beside them.
const PROFILES = {
  smoke: {
    stages: [
      { duration: "5s", target: 2 },
      { duration: "1m30s", target: 2 },
    ],
    tabs: 2,
  },
  load: {
    stages: [
      { duration: "2m", target: 50 },
      { duration: "5m", target: 50 },
      { duration: "1m", target: 0 },
    ],
    tabs: 25,
  },
  stress: {
    stages: [
      { duration: "2m", target: 100 },
      { duration: "3m", target: 100 },
      { duration: "2m", target: 200 },
      { duration: "3m", target: 200 },
      { duration: "2m", target: 400 },
      { duration: "3m", target: 400 },
      { duration: "2m", target: 0 },
    ],
    tabs: 50,
  },
  spike: {
    stages: [
      { duration: "30s", target: 20 },
      { duration: "1m", target: 20 },
      { duration: "20s", target: 300 },
      { duration: "2m", target: 300 },
      { duration: "20s", target: 20 },
      { duration: "1m", target: 20 },
      { duration: "20s", target: 0 },
    ],
    tabs: 25,
  },
  soak: {
    stages: [
      { duration: "2m", target: 50 },
      { duration: "45m", target: 50 },
      { duration: "2m", target: 0 },
    ],
    tabs: 50,
  },
};

const profile = PROFILES[PROFILE];
if (!profile) throw new Error(`Unknown PROFILE "${PROFILE}"`);
const tabs = Number(__ENV.TABS ?? profile.tabs);
const runLength = profile.stages
  .map((stage) => parseDuration(stage.duration))
  .reduce((total, seconds) => total + seconds, 0);

export const options = {
  scenarios: {
    users: {
      executor: "ramping-vus",
      exec: "userSession",
      startVUs: 0,
      stages: profile.stages,
      gracefulRampDown: "1m",
    },
    ...(tabs > 0 && {
      tabs: {
        executor: "constant-vus",
        exec: "openTab",
        vus: tabs,
        duration: `${runLength}s`,
        gracefulStop: "0s",
      },
    }),
  },
  // Starting points, to tune once there's a baseline.
  thresholds: {
    "http_req_failed{scenario:users}": ["rate<0.01"],
    "http_req_duration{kind:api}": ["p(95)<500"],
    chat_ready: ["p(95)<1000"],
    chat_overhead: ["p(95)<1000"],
    checks: ["rate>0.99"],
  },
  setupTimeout: "2m",
};

/** Time until the API starts streaming a reply: the turn's claims and reads. */
const chatReady = new Trend("chat_ready", true);
/** A whole reply, less the time the stand-in model spends producing it. */
const chatOverhead = new Trend("chat_overhead", true);
/** Confirming an upload to its transcript being stored. */
const transcriptionTime = new Trend("transcription_time", true);
const chatFailed = new Rate("chat_failed");
const transcriptionFailed = new Rate("transcription_failed");

export function setup() {
  const maxVus =
    Math.max(...profile.stages.map((stage) => stage.target)) + tabs;
  if (maxVus > USERS) {
    fail(
      `${maxVus} VUs need ${maxVus} users; raise LOADTEST_USERS and re-run seed-users`,
    );
  }

  const tokens = http
    .get(`${MOCKS}/loadtest/tokens?count=${maxVus}`)
    .json("tokens");
  const { delays } = http.get(`${MOCKS}/loadtest/stats`).json();
  // What one reply costs at the stand-in, so the rest can be measured.
  const modelReplyMs =
    delays.chatFirstTokenMs + delays.chatTokens * delays.chatTokenIntervalMs;
  return { tokens, modelReplyMs };
}

// Each VU is one user, so each has its own conversations, rate limits and
// event streams, as real users would.
function tokenFor(data) {
  return data.tokens[(__VU - 1) % data.tokens.length];
}

function params(token, name, kind = "api", extra = {}) {
  return {
    headers: { Cookie: `session=${token}`, "Content-Type": "application/json" },
    tags: { name, kind },
    ...extra,
  };
}

const audioBytes = AUDIO_SHARE > 0 ? randomBytes(AUDIO_KB * 1024) : null;

export function userSession(data) {
  const token = tokenFor(data);
  const get = (path, name = path) =>
    http.get(`${API}${path}`, params(token, name));

  // Opening the app.
  check(get("/auth/me"), { "signed in": (r) => r.status === 200 });
  check(get("/models/chat"), { "chat models listed": (r) => r.status === 200 });
  check(get("/conversations"), {
    "conversations listed": (r) => r.status === 200,
  });
  check(get("/jobs"), { "jobs listed": (r) => r.status === 200 });
  sleep(randomBetween(1, 3));

  const created = http.post(
    `${API}/conversations`,
    "{}",
    params(token, "POST /conversations"),
  );
  if (!check(created, { "conversation created": (r) => r.status === 201 }))
    return;
  const conversationId = created.json("id");

  let lastMessageId = sendMessage(
    data,
    token,
    conversationId,
    null,
    "Hello there",
  );
  sleep(randomBetween(3, 8));
  if (lastMessageId) {
    lastMessageId = sendMessage(
      data,
      token,
      conversationId,
      lastMessageId,
      "Tell me more",
    );
  }
  sleep(randomBetween(2, 5));

  if (lastMessageId && Math.random() < AUDIO_SHARE) {
    const audioUploadId = uploadAndTranscribe(token);
    if (audioUploadId) {
      sendMessage(
        data,
        token,
        conversationId,
        lastMessageId,
        "Summarize this",
        [{ type: "transcript", audioUploadId }],
      );
    }
  }

  check(
    get(
      `/conversations/${conversationId}/messages`,
      "GET /conversations/:id/messages",
    ),
    {
      "history loaded": (r) => r.status === 200,
    },
  );
  sleep(randomBetween(2, 5));
}

/** Sends a turn and reads the streamed reply; returns the new lastMessageId. */
function sendMessage(
  data,
  token,
  conversationId,
  lastMessageId,
  content,
  attachments = [],
) {
  const res = http.post(
    `${API}/conversations/${conversationId}/messages`,
    JSON.stringify({
      messageContent: content,
      chosenModelId: CHAT_MODEL,
      attachments,
      lastMessageId,
    }),
    params(token, "POST /conversations/:id/messages", "chat", {
      timeout: "3m",
    }),
  );

  const done =
    res.status === 200
      ? sseEvents(res.body).find((e) => e.event === "done")
      : undefined;
  const ok = check(res, {
    "reply streamed and saved": () => done !== undefined,
  });
  chatFailed.add(!ok);
  if (!ok) return null;

  chatReady.add(res.timings.waiting);
  chatOverhead.add(res.timings.duration - data.modelReplyMs);
  return JSON.parse(done.data).lastMessageId;
}

/** Uploads audio straight to storage, confirms it and waits for the transcript. */
function uploadAndTranscribe(token) {
  const minted = http.post(
    `${API}/upload/audio`,
    "{}",
    params(token, "POST /upload/audio"),
  );
  if (!check(minted, { "upload URL minted": (r) => r.status === 200 }))
    return null;
  const { uploadId, signedUploadUrl } = minted.json();

  const put = http.put(signedUploadUrl, audioBytes, {
    headers: { "Content-Type": "audio/mpeg" },
    tags: { name: "PUT storage upload", kind: "storage" },
  });
  if (!check(put, { "audio stored": (r) => r.status === 200 })) return null;

  const confirmed = http.post(
    `${API}/upload/audio/confirm`,
    JSON.stringify({ uploadId, fileName: "loadtest.mp3" }),
    params(token, "POST /upload/audio/confirm"),
  );
  if (!check(confirmed, { "upload confirmed": (r) => r.status === 200 }))
    return null;

  // Polled rather than heard on GET /events, which k6 can't read as a stream.
  const started = Date.now();
  let status = "queued";
  while (status === "queued" || status === "processing") {
    if (Date.now() - started > 120_000) break;
    sleep(1);
    const job = http.get(
      `${API}/jobs/transcribe/${uploadId}`,
      params(token, "GET /jobs/transcribe/:id"),
    );
    status = job.status === 200 ? job.json("status") : "error";
  }

  const ok = check(status, { "transcript stored": (s) => s === "completed" });
  transcriptionFailed.add(!ok);
  if (!ok) return null;
  transcriptionTime.add(Date.now() - started);
  return uploadId;
}

/**
 * An open tab: holds GET /events as the browser does. k6 can't read a stream
 * as it arrives, so the request simply stays open until its timeout, which
 * k6 then reports as a failed request of this scenario only.
 */
export function openTab(data) {
  http.get(`${API}/events`, {
    headers: { Cookie: `session=${tokenFor(data)}` },
    tags: { name: "GET /events", kind: "stream" },
    timeout: "2m",
  });
}

function sseEvents(body) {
  const events = [];
  for (const block of String(body).split("\n\n")) {
    let event = "message";
    let payload = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) payload += line.slice(5).trim();
    }
    if (payload) events.push({ event, data: payload });
  }
  return events;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

/** Seconds in a k6 duration such as "45m" or "1m30s". */
function parseDuration(text) {
  const parts = [...text.matchAll(/(\d+)(h|m|s)/g)];
  if (parts.length === 0 || parts.map((part) => part[0]).join("") !== text) {
    throw new Error(`Unsupported duration "${text}"`);
  }
  const unit = { s: 1, m: 60, h: 3600 };
  return parts.reduce((total, [, n, u]) => total + Number(n) * unit[u], 0);
}
