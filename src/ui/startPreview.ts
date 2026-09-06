import type { PreviewApp } from './views/PreviewApp';

/** Reload the persistent catalog; creation always starts with an explicit request. */
export async function startPreview(app: PreviewApp, search: string): Promise<void> {
  await app.ready;
  const query = new URLSearchParams(search);
  if (query.get('view') === '3d') app.setMode('3d');
  if (!query.has('city') && !query.has('blueprint')) app.showCreation(false);
  await Promise.all([
    app.refreshCities(),
    query.has('city') ? app.openCityId(query.get('city')!) : query.has('blueprint') ? app.loadBlueprintUrl(query.get('blueprint')!) : Promise.resolve(),
  ]);
}
