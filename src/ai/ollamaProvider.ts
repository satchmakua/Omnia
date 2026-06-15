// Opt-in provider backed by a local Ollama server (OpenAI-compatible API). Async
// only — it has no `completeSync`, so the in-sim path treats it as off-the-hot-path
// work (see AIRunner) and records responses for deterministic replay. Not exercised
// in tests/CI (no network); selected via config when the user runs a real model.
import type { AIProvider } from './provider.ts';
import { embedText } from './provider.ts';

export interface OllamaOptions {
  baseUrl: string;
  model: string;
}

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  constructor(private readonly opts: OllamaOptions) {}

  async complete(prompt: string): Promise<string> {
    const res = await fetch(`${this.opts.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.opts.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: 0.8,
        max_tokens: 60,
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return (data.choices?.[0]?.message?.content ?? '').trim();
  }

  // Real embeddings are a refinement (backlog); the deterministic hash embed is
  // adequate for relevance ranking and keeps memory retrieval model-independent.
  embed(text: string): number[] {
    return embedText(text);
  }
}
