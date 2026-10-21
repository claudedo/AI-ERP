/** Per warm instance: useful basic protection, not a distributed quota or billing cap. */
export class ChatRateLimit {
  private clients = new Map<string, { start: number; count: number; ids: Set<string> }>();
  constructor(private limit = 10, private windowMs = 60000) {}
  accept(client: string, requestId: string, now = Date.now()) {
    if (this.clients.size >= 2000) for (const [key, value] of this.clients) if (now - value.start >= this.windowMs) this.clients.delete(key);
    let state = this.clients.get(client);
    if (!state || now - state.start >= this.windowMs) {
      if (this.clients.size >= 2000 && !state) return false;
      state = { start: now, count: 0, ids: new Set() }; this.clients.set(client, state);
    }
    if (state.count >= this.limit || state.ids.has(requestId)) return false;
    state.count++; state.ids.add(requestId); return true;
  }
}
