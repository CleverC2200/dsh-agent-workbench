export function scrollbarGeometry(table: { left: number; right: number; top: number; bottom: number }, workspace: { left: number; right: number; top: number; bottom: number }, viewport: { width: number; height: number }, clientWidth: number, scrollWidth: number) {
  const left = Math.max(0, table.left, workspace.left);
  const right = Math.min(viewport.width, table.right, workspace.right);
  const bottomEdge = Math.min(viewport.height, workspace.bottom);
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  return { left, width: Math.max(0, right - left), bottom: Math.max(0, viewport.height - bottomEdge), maxScroll,
    // Once the native bottom scrollbar is reachable, do not show a second one.
    // A one-pixel tolerance avoids flicker from fractional layout/zoom coordinates.
    visible: maxScroll > 1 && right > left && table.bottom > bottomEdge + 1 && table.top < bottomEdge - 20 };
}
