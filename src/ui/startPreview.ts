import type { PreviewApp } from './views/PreviewApp';

/** Reload the persistent catalog; creation always starts with an explicit request. */
export async function startPreview(app: PreviewApp, search: string): Promise<void> {
  const query = new URLSearchParams(search);
  if (query.get('view') === '3d') app.setMode('3d');
  await Promise.all([
    app.refreshCities(),
    query.has('blueprint') ? app.loadBlueprintUrl(query.get('blueprint')!) : Promise.resolve(),
  ]);
}
