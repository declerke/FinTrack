interface ParsedDecimal {
  coefficient: bigint;
  scale: number;
}

function isAsciiDigits(value: string): boolean {
  return value.length > 0 && [...value].every((character) => character >= '0' && character <= '9');
}

function parseDecimalString(value: string): ParsedDecimal | null {
  const normalized = value.trim();
  const isNegative = normalized.startsWith('-');
  const unsigned = normalized.startsWith('-') || normalized.startsWith('+')
    ? normalized.slice(1)
    : normalized;
  const parts = unsigned.split('.');
  if (parts.length > 2 || !isAsciiDigits(parts[0])) return null;

  const fractionalPart = parts[1] ?? '';
  if (fractionalPart && !isAsciiDigits(fractionalPart)) return null;

  const coefficientText = `${parts[0]}${fractionalPart}`;
  const coefficient = BigInt(coefficientText) * (isNegative ? -1n : 1n);
  return { coefficient, scale: fractionalPart.length };
}

function decimalString(coefficient: bigint, scale: number): string {
  const isNegative = coefficient < 0n;
  const digits = (isNegative ? -coefficient : coefficient).toString().padStart(scale + 1, '0');
  const integerPart = scale === 0 ? digits : digits.slice(0, -scale);
  const fractionalPart = scale === 0 ? '' : digits.slice(-scale);
  const sign = isNegative ? '-' : '';
  return scale === 0 ? `${sign}${integerPart}` : `${sign}${integerPart}.${fractionalPart}`;
}

export function multiplyDecimalStrings(left: string, right: string): string {
  const leftDecimal = parseDecimalString(left);
  const rightDecimal = parseDecimalString(right);
  if (!leftDecimal || !rightDecimal) return '0';

  return decimalString(
    leftDecimal.coefficient * rightDecimal.coefficient,
    leftDecimal.scale + rightDecimal.scale,
  );
}

export function compareDecimalStrings(left: string, right: string): number {
  const leftDecimal = parseDecimalString(left);
  const rightDecimal = parseDecimalString(right);
  if (!leftDecimal || !rightDecimal) return 0;

  const sharedScale = Math.max(leftDecimal.scale, rightDecimal.scale);
  const scaledLeft = leftDecimal.coefficient * 10n ** BigInt(sharedScale - leftDecimal.scale);
  const scaledRight = rightDecimal.coefficient * 10n ** BigInt(sharedScale - rightDecimal.scale);
  return scaledLeft < scaledRight ? -1 : scaledLeft > scaledRight ? 1 : 0;
}

export function roundDecimalString(value: string, decimalPlaces: number): string | null {
  const parsedDecimal = parseDecimalString(value);
  if (!parsedDecimal || !Number.isInteger(decimalPlaces) || decimalPlaces < 0) return null;

  const divisor = 10n ** BigInt(parsedDecimal.scale);
  const scaledValue = parsedDecimal.coefficient * 10n ** BigInt(decimalPlaces);
  let roundedValue = scaledValue / divisor;
  const remainder = scaledValue % divisor;
  if ((remainder < 0n ? -remainder : remainder) * 2n >= divisor && remainder !== 0n) {
    roundedValue += parsedDecimal.coefficient < 0n ? -1n : 1n;
  }
  return decimalString(roundedValue, decimalPlaces);
}
