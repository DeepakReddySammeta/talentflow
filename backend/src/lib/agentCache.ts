import { JwtPayload } from "../types";

/**
 * In-memory cache for finished agentic-search results, keyed by caller +
 * normalized prompt. Search turns are read-only lookups, so re-asking the
 * same question (or re-clicking the same surface button, which reaches the
 * agent as a synthesized prompt — see websocket.ts) doesn't need to pay for
 * another LLM round trip + tool calls.
 *
 * Cleared wholesale whenever any write is confirmed (see
 * actions.routes.ts) rather than tracking per-entity dependencies — coarse,
 * but correct: we'd rather over-invalidate than serve a stale result right
 * after the user just changed the underlying data.
 */

const TTL_MS = 3 * 60 * 1000; // long enough to help repeated clicks/questions, short enough that staleness isn't a real concern
const MAX_ENTRIES = 200;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class AgentResultCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    if (!this.store.has(key) && this.store.size >= MAX_ENTRIES) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + TTL_MS });
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Cache key scoped to the caller's identity (results are role/department/
 * ownership-scoped — see tools.ts — so two different users must never
 * share an entry) plus the exact query. dataModel is the client's active
 * filter state, which the agent folds into its prompt, so it's part of
 * what makes two turns "the same question."
 */
export function buildCacheKey(caller: JwtPayload, prompt: string, dataModel?: Record<string, unknown> | null): string {
  const normalizedPrompt = prompt.trim().toLowerCase().replace(/\s+/g, " ");
  return JSON.stringify({
    userId: caller.userId,
    role: caller.role,
    department: caller.department ?? null,
    prompt: normalizedPrompt,
    dataModel: dataModel ?? null,
  });
}
