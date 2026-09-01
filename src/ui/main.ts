/** Preview entry point: mount the app, fit it to the window, build the first city. */
import { PreviewApp } from './views/PreviewApp';
import './style.css';

const app = new PreviewApp();
document.getElementById('app')!.append(app.root);

window.addEventListener('resize', () => app.resize());
app.resize();

void app.generate({ seed: 'urbe' });
