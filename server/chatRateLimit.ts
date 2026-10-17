/** Per warm instance: useful basic protection, not a distributed quota or billing cap. */
export class ChatRateLimit {
  private clients = new Map<string, { start: number; count: number; ids: Set<string> }>();
  accept(client: string, requestId: string, now = Date.now(), fingerprint?: string) {
    if (this.clients.size >= 2000) for (const [key, value] of this.clients) if (now - value.start >= 60000) this.clients.delete(key);
    let state = this.clients.get(client);
    if (!state || now - state.start >= 60000) {
      if (this.clients.size >= 2000 && !state) return false;
      state = { start: now, count: 0, ids: new Set() }; this.clients.set(client, state);
    }
    if (state.count >= 10 || state.ids.has(requestId) || fingerprint && state.ids.has(`content:${fingerprint}`)) return false;
    state.count++; state.ids.add(requestId); if (fingerprint) state.ids.add(`content:${fingerprint}`); return true;
  }
}
