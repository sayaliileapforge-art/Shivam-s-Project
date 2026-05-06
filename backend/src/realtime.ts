import type { Response } from 'express';

export type RealtimeEvent = {
  type: string;
  templateId?: string;
  projectId?: string;
  productId?: string;
  isGlobal?: boolean;
  updatedAt?: string;
  payload?: Record<string, any>;
};

type RealtimeClient = {
  res: Response;
  projectId?: string;
};

const clients = new Set<RealtimeClient>();

function writeEvent(res: Response, event: RealtimeEvent): void {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function shouldSendEvent(client: RealtimeClient, event: RealtimeEvent): boolean {
  if (!client.projectId) return true;
  if (event.isGlobal) return true;
  if (!event.projectId) return false;
  return event.projectId === client.projectId;
}

export function registerRealtimeClient(res: Response, projectId?: string): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const client: RealtimeClient = { res, projectId };
  clients.add(client);

  writeEvent(res, { type: 'connected', updatedAt: new Date().toISOString() });

  const keepAlive = setInterval(() => {
    res.write(':keep-alive\n\n');
  }, 15000);

  res.on('close', () => {
    clearInterval(keepAlive);
    clients.delete(client);
  });
}

export function emitRealtimeEvent(event: RealtimeEvent): void {
  const payload: RealtimeEvent = {
    ...event,
    updatedAt: event.updatedAt || new Date().toISOString(),
  };

  for (const client of clients) {
    if (shouldSendEvent(client, payload)) {
      writeEvent(client.res, payload);
    }
  }
}
