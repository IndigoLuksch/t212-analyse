/** CSS custom property for a color slot (1–8), or muted for others */
export function slotVar(slot: number | null | undefined): string {
  if (slot == null || slot < 1 || slot > 8) return "var(--muted)";
  return `var(--slot-${slot})`;
}

export const SLOT_LABELS = [
  "blue",
  "orange",
  "aqua",
  "yellow",
  "magenta",
  "green",
  "violet",
  "red",
] as const;
