/** Releases a waiting observer when cancellation is confirmed, even for an unresponsive transport. */
export function abortable<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Generation cancelled.', 'AbortError'));
    if (signal.aborted) { work.catch(() => undefined); abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
