/** Short-lived CSRF state for YNAB OAuth (in-memory). */
const pending = new Map<string, number>();
const TTL_MS = 15 * 60 * 1000;

export function createYnabOAuthState(): string {
  const state = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  pending.set(state, Date.now());
  prune();
  return state;
}

export function consumeYnabOAuthState(state: string): boolean {
  prune();
  const t = pending.get(state);
  if (!t) return false;
  pending.delete(state);
  return Date.now() - t < TTL_MS;
}

function prune(): void {
  const now = Date.now();
  for (const [k, t] of pending) {
    if (now - t > TTL_MS) pending.delete(k);
  }
}
