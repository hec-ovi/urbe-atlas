import type { PreviewApp } from './views/PreviewApp';

/** An explicit saved source never falls back to generation, even when loading fails. */
export async function startPreview(app: PreviewApp, search: string): Promise<void> {
  const query = new URLSearchParams(search);
  if (query.get('view') === '3d') app.setMode('3d');
  if (query.has('blueprint')) await app.loadBlueprintUrl(query.get('blueprint')!);
  else await app.generate({ seed: 'urbe' });
}
