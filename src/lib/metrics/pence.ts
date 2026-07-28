/** True for pence-quoted listings (LSE quotes in GBX/GBp, not GBP). */
// 'GBp' must match case-sensitively — uppercasing it collides with real GBP.
export function isPence(currency: string): boolean {
  return currency === 'GBp' || currency.toUpperCase() === 'GBX';
}

/** Convert a price to major currency units (GBp/GBX → divide by 100). */
export function toMajorUnits(price: number, currency: string): number {
  return isPence(currency) ? price / 100 : price;
}
