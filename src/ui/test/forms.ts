import { vi } from 'vitest';
import creation from '../../cities/forms/creation.json';
import visualization from '../../cities/forms/visualization.json';

export const CREATION_FORM = creation;
export const VISUALIZATION_FORM = visualization;

export function formPayload(url: string): unknown | undefined {
  if (url === '/api/forms/creation') return creation;
  if (url === '/api/forms/visualization') return visualization;
  if (url === '/api/forms') return { forms: ['creation', 'visualization'] };
  return undefined;
}

export function stubWorkspaceFetch(
  handler?: (url: string, init?: RequestInit) => unknown,
): ReturnType<typeof vi.fn> {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const form = formPayload(url);
    if (form) return { ok: true, status: 200, json: async () => form };
    if (handler) {
      const value = await handler(url, init);
      if (value && typeof value === 'object' && 'ok' in value) return value;
      return { ok: true, status: 200, json: async () => value };
    }
    return { ok: true, status: 200, json: async () => ({ contractVersion: '1.0', available: false, reason: 'Test service unavailable' }) };
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
