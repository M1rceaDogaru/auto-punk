// Dev check: one real chatJSON call through the server's LlmClient against LM Studio.
import { LlmClient } from '../src/llm/llmClient.js';

const client = new LlmClient({
  baseUrl: process.env.LLM_BASE_URL ?? 'http://localhost:1234/v1',
  apiKey: process.env.LLM_API_KEY ?? 'lm-studio',
  model: process.env.LLM_MODEL ?? 'qwen3.8-27b',
});

const t0 = Date.now();
const out = await client.chatJSON(
  [
    { role: 'system', content: 'You are a helpful assistant. Respond with ONLY valid JSON, no prose.' },
    { role: 'user', content: 'Return the JSON object {"ok": true, "n": 42}.' },
  ],
  (p) => {
    const o = p as Record<string, unknown>;
    if (o.ok !== true || o.n !== 42) throw new Error('unexpected payload');
    return o;
  },
  { temperature: 0, maxTokens: 60 },
);
console.log(`[llm-ping] OK in ${Date.now() - t0}ms ->`, JSON.stringify(out));
