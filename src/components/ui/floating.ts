export interface Viewport {
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
}

export function placeFloating(
  anchor: { x: number; y: number },
  box: { width: number; height: number },
  viewport: Viewport,
  gap = 12,
  margin = 8,
): Placement {
  const flipLeft = anchor.x + gap + box.width > viewport.width;
  const flipUp = anchor.y + gap + box.height > viewport.height;

  const rawLeft = flipLeft ? anchor.x - gap - box.width : anchor.x + gap;
  const rawTop = flipUp ? anchor.y - gap - box.height : anchor.y + gap;

  const maxLeft = Math.max(margin, viewport.width - box.width - margin);
  const maxTop = Math.max(margin, viewport.height - box.height - margin);

  const left = Math.min(Math.max(rawLeft, margin), maxLeft);
  const top = Math.min(Math.max(rawTop, margin), maxTop);

  return { left, top };
}
