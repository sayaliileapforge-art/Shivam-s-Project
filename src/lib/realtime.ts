import { API_BASE } from './apiService';

export type RealtimeEvent = {
  type: string;
  templateId?: string;
  projectId?: string;
  productId?: string;
  isGlobal?: boolean;
  updatedAt?: string;
  payload?: Record<string, any>;
};

function resolveRealtimeUrl(projectId?: string): string {
  const base = API_BASE.replace(/\/api$/, '');
  const url = new URL(`${base}/api/realtime/stream`, window.location.origin);
  if (projectId) {
    url.searchParams.set('projectId', projectId);
  }
  return url.toString();
}

export function subscribeToTemplateUpdates(
  projectId: string | undefined,
  onEvent: (event: RealtimeEvent) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const source = new EventSource(resolveRealtimeUrl(projectId));

  const handler = (evt: MessageEvent) => {
    try {
      const data = JSON.parse(evt.data) as RealtimeEvent;
      onEvent(data);
    } catch {
      // Ignore malformed events
    }
  };

  // The backend sends `event: connected` immediately after each (re)connection.
  // Skip the very first one (the fetch useEffect handles initial load), but fire
  // onEvent for every subsequent reconnect so the caller can refetch from the DB.
  let isInitialConnect = true;
  const connectedHandler = (evt: MessageEvent) => {
    if (isInitialConnect) {
      isInitialConnect = false;
      return;
    }
    // Reconnected — notify caller to refetch latest data from the database.
    try {
      const data = JSON.parse(evt.data) as RealtimeEvent;
      onEvent(data);
    } catch {
      onEvent({ type: 'connected' });
    }
  };

  source.addEventListener('connected', connectedHandler);
  source.addEventListener('template:created', handler);
  source.addEventListener('template:updated', handler);
  source.addEventListener('template:deleted', handler);

  return () => {
    source.removeEventListener('connected', connectedHandler);
    source.removeEventListener('template:created', handler);
    source.removeEventListener('template:updated', handler);
    source.removeEventListener('template:deleted', handler);
    source.close();
  };
}
