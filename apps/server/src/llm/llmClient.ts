export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

export class LlmError extends Error {}

/** Extract the first JSON object from a model response, tolerating code fences / stray prose. */
export function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('no JSON object found in response');
  return JSON.parse(t.slice(start, end + 1));
}

/**
 * Minimal OpenAI-compatible chat client backed by fetch. No SDK dependency so it works
 * against any local server (LM Studio). Structured output is achieved via prompting plus
 * robust extraction and validation with retries — portable across models that may not
 * support `response_format`.
 */
export class LlmClient {
  constructor(private readonly cfg: LlmConfig) {}

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
    const body: { model: string; messages: ChatMessage[]; temperature: number; stream: boolean; max_tokens?: number } = {
      model: this.cfg.model,
      messages,
      temperature: opts?.temperature ?? this.cfg.temperature ?? 0.8,
      stream: false,
    };
    const maxTokens = opts?.maxTokens ?? this.cfg.maxTokens;
    if (maxTokens) body.max_tokens = maxTokens;

    const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LlmError(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new LlmError('LLM returned no content');
    return content;
  }

  /**
   * Run a chat completion that must yield a validated JSON object. Retries with corrective
   * feedback when parsing or validation fails.
   */
  async chatJSON<T>(
    initialMessages: ChatMessage[],
    validate: (parsed: unknown) => T,
    opts?: ChatOptions & { retries?: number },
  ): Promise<T> {
    const messages = [...initialMessages];
    const attempts = opts?.retries ?? 3;
    let lastErr: unknown;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const raw = await this.chat(messages, opts);
      try {
        return validate(extractJson(raw));
      } catch (err) {
        lastErr = err;
        messages.push({ role: 'assistant', content: raw });
        messages.push({
          role: 'user',
          content: `Your previous response was not valid JSON or failed validation (${String(
            (err as Error)?.message ?? err,
          )}). Respond again with ONLY the corrected JSON object — no prose, no code fences.`,
        });
      }
    }

    throw new LlmError(`chatJSON failed after ${attempts} attempts: ${String((lastErr as Error)?.message ?? lastErr)}`);
  }
}
