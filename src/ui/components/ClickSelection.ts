/** A primary pointer release selects only when the gesture never became a drag. */
export class ClickSelection {
  constructor(canvas: HTMLCanvasElement, select: (event: PointerEvent) => void) {
    let press: { id: number; x: number; y: number; dragged: boolean } | null = null;
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button === 0) press = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
    });
    window.addEventListener('pointermove', (event) => {
      if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4) press.dragged = true;
    });
    window.addEventListener('pointerup', (event) => {
      if (press?.id !== event.pointerId) return;
      const click = event.button === 0 && !press.dragged
        && Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 4;
      press = null;
      if (click && event.target === canvas) select(event);
    });
    window.addEventListener('pointercancel', () => { press = null; });
    window.addEventListener('blur', () => { press = null; });
  }
}
