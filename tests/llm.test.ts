import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { LlmError, getLlmConfig, streamLlmText } from "../lib/llm";

const envKeys = ["LLM_PROVIDER", "LLM_MODEL", "LLM_API_KEY", "LLM_BASE_URL", "DOUBAO_API_KEY", "DOUBAO_MODEL_ID", "DOUBAO_BASE_URL"] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

function setTestEnv() {
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_MODEL;
  delete process.env.LLM_API_KEY;
  delete process.env.LLM_BASE_URL;
  process.env.DOUBAO_API_KEY = "test-key";
  process.env.DOUBAO_MODEL_ID = "doubao-default-model";
  process.env.DOUBAO_BASE_URL = "https://model.invalid/api/v3";
}

test("LLM config defaults to the existing Doubao provider and legacy model id", () => {
  const config = getLlmConfig({ DOUBAO_API_KEY: "key", DOUBAO_MODEL_ID: "existing-doubao-pro" });
  assert.equal(config.provider, "doubao");
  assert.equal(config.model, "existing-doubao-pro");
});

test("LLM_MODEL centrally overrides the provider model id", () => {
  const config = getLlmConfig({ LLM_PROVIDER: "doubao", LLM_MODEL: "configured-model", DOUBAO_API_KEY: "key", DOUBAO_MODEL_ID: "legacy-model" });
  assert.equal(config.model, "configured-model");
});

test("an unknown provider fails clearly instead of falling back", () => {
  assert.throws(() => getLlmConfig({ LLM_PROVIDER: "unknown", DOUBAO_API_KEY: "key", DOUBAO_MODEL_ID: "model" }), (error: unknown) => error instanceof LlmError && error.kind === "configuration" && /不支持的模型服务/.test(error.message));
});

test("the unified LLM service yields provider-neutral streaming text", async (t) => {
  setTestEnv();
  const captured: { url: string; body: { model: string; temperature: number; messages: { role: string; content: string }[] } }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    captured.push({ url, body: JSON.parse(String(options.body)) });
    return new Response('data: {"choices":[{"delta":{"content":"第一段"}}]}\n\ndata: {"choices":[{"delta":{"content":"第二段"}}]}\n\ndata: [DONE]\n\n', { headers: { "Content-Type": "text/event-stream" } });
  });
  const stream = await streamLlmText({ messages: [{ role: "system", content: "系统规则" }, { role: "user", content: "正文任务" }], temperature: 0.25 });
  const events = [];
  for await (const event of stream) events.push(event);
  assert.deepEqual(events, [{ type: "text", text: "第一段" }, { type: "text", text: "第二段" }, { type: "done" }]);
  assert.deepEqual(captured, [{ url: "https://model.invalid/api/v3/chat/completions", body: { model: "doubao-default-model", stream: true, max_tokens: 4096, temperature: 0.25, messages: [{ role: "system", content: "系统规则" }, { role: "user", content: "正文任务" }] } }]);
});

test("the unified LLM service preserves an already-aborted request", async () => {
  setTestEnv();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => streamLlmText({ messages: [{ role: "user", content: "任务" }], temperature: 0.5, signal: controller.signal }), (error: unknown) => error instanceof LlmError && error.kind === "aborted");
});

test("the generation route has no direct Doubao request or stream-format dependency", async () => {
  const route = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
  assert.match(route, /streamLlmText/);
  assert.doesNotMatch(route, /DOUBAO_|chat\/completions|choices\?\.\[0\]\?\.delta/);
});

test.after(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});
