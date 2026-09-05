/** Mount the workspace and restore its server city catalog. */
import { PreviewApp } from './views/PreviewApp';
import { startPreview } from './startPreview';
import './style.css';

const app = new PreviewApp();
document.getElementById('app')!.append(app.root);

window.addEventListener('resize', () => app.resize());
app.resize();

void startPreview(app, window.location.search);
