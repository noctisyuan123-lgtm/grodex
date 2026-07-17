import type { ServerResponse } from "node:http";
import type { ChatEvent } from "./chat-events.js";

const clients = new Set<ServerResponse>();

export function addSseClient(res: ServerResponse): void {
  clients.add(res);
}

export function removeSseClient(res: ServerResponse): void {
  clients.delete(res);
}

export function broadcastChatEvent(event: ChatEvent): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

export function sseClientCount(): number {
  return clients.size;
}
