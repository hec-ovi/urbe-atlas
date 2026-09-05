/** Rounds a rational coordinate once to the nearest Float64, with even midpoint ties. */
export function numericCoordinate(numerator: bigint, denominator: bigint): number {
  if (!numerator) return 0;
  const negative = numerator < 0n, magnitude = negative ? -numerator : numerator;
  let exponent = magnitude.toString(2).length - denominator.toString(2).length;
  if (exponent >= 0 ? magnitude < (denominator << BigInt(exponent)) : (magnitude << BigInt(-exponent)) < denominator) exponent--;
  const spacing = Math.max(-1074, exponent - 52);
  const scaled = spacing < 0 ? magnitude << BigInt(-spacing) : magnitude;
  const divisor = spacing > 0 ? denominator << BigInt(spacing) : denominator;
  let quotient = scaled / divisor;
  const remainder = scaled % divisor;
  if (2n * remainder > divisor || (2n * remainder === divisor && (quotient & 1n))) quotient++;
  const value = Number(quotient) * 2 ** spacing;
  return negative ? -value : value;
}
