/**
 * Shared ACP JSON-RPC transport contract.
 * Framing only — no Grok extensions, no DomainEvent mapping.
 */

export type JsonRpcMsg = {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

export type AcpHandlers = {
  onRequest: (
    id: number | string,
    method: string,
    params: unknown
  ) => void | Promise<void>;
  onNotification: (method: string, params: unknown) => void;
  onClose?: (reason?: string) => void;
};

export interface AcpTransport {
  isAlive(): boolean;
  send(
    method: string,
    params?: unknown,
    timeoutMs?: number
  ): Promise<unknown>;
  notify(method: string, params?: unknown): void;
  reply(id: number | string, result: unknown): void;
  replyError(id: number | string, message: string, code?: number): void;
  setHandlers(handlers: AcpHandlers): void;
  close(): void;
  dispose(): void;
}
