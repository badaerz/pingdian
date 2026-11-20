type SlowRequest = { id: number; label: string; cancel: () => void };
const initial: readonly SlowRequest[] = [];
let slowRequests = initial;
let sequence = 0;
const listeners = new Set<() => void>();
function publish(next: readonly SlowRequest[]) {
  slowRequests = next;
  for (const listener of listeners) listener();
}
export const pendingAi = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  snapshot: () => slowRequests,
  serverSnapshot: () => initial,
};

// Keep the cancel control alive until the response body has arrived.
export async function fetchAi(label: string, init: RequestInit) {
  const controller = new AbortController();
  const id = ++sequence;
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => {
    if (!signal.aborted) publish([...slowRequests, { id, label, cancel: () => controller.abort() }]);
  }, 3000);
  try {
    const response = await fetch("/api/ai", { ...init, signal });
    const body: unknown = await response.json();
    signal.throwIfAborted();
    return { ok: response.ok, json: async () => body };
  } finally {
    clearTimeout(timer);
    if (slowRequests.some(item => item.id === id)) publish(slowRequests.filter(item => item.id !== id));
  }
}
