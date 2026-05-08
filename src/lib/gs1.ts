export function calculateSSCCCheckDigit(s: string): number {
  let total = 0;
  const reversed = s.split('').reverse().join('');
  for (let i = 0; i < reversed.length; i++) {
    const weight = i % 2 === 0 ? 3 : 1;
    total += parseInt(reversed[i]) * weight;
  }
  return (10 - (total % 10)) % 10;
}

export function generateNextSSCC(lastSSCC: string): string {
  const prefix = lastSSCC.slice(0, -1);
  const val = BigInt(prefix);
  const nextVal = val + 1n;
  const newPrefix = nextVal.toString().padStart(prefix.length, '0');
  const check = calculateSSCCCheckDigit(newPrefix);
  return newPrefix + check.toString();
}

export const GS_CHAR = '\x1d';
