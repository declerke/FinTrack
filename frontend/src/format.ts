import { roundDecimalString } from './decimal';

const QUANTITY_DECIMAL_PLACES = 6;

function groupedInteger(value: string): string {
  return new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(BigInt(value));
}

export function formatCurrency(value: string | number, currency: string): string {
  const formatter = new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (typeof value === 'number') {
    return formatter.format(Number.isFinite(value) ? value : 0);
  }

  const roundedValue = roundDecimalString(value, 2);
  if (roundedValue === null) return formatter.format(0);

  const isNegative = roundedValue.startsWith('-');
  const [integerPart, fractionalPart = '00'] = (isNegative ? roundedValue.slice(1) : roundedValue).split('.');
  const formattedInteger = groupedInteger(integerPart);
  let integerInserted = false;

  return formatter.formatToParts(isNegative ? -1.23 : 1.23).map((part) => {
    if (part.type === 'integer') {
      if (integerInserted) return '';
      integerInserted = true;
      return formattedInteger;
    }
    if (part.type === 'group') return '';
    if (part.type === 'fraction') return fractionalPart;
    return part.value;
  }).join('');
}

export function formatQuantity(value: string | number): string {
  if (typeof value === 'number') {
    return new Intl.NumberFormat('en-KE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: QUANTITY_DECIMAL_PLACES,
    }).format(Number.isFinite(value) ? value : 0);
  }

  const roundedValue = roundDecimalString(value, QUANTITY_DECIMAL_PLACES);
  if (roundedValue === null) return '0';

  const isNegative = roundedValue.startsWith('-');
  const [integerPart, fractionalPart = ''] = (isNegative ? roundedValue.slice(1) : roundedValue).split('.');
  let trimmedFraction = fractionalPart;
  while (trimmedFraction.endsWith('0')) trimmedFraction = trimmedFraction.slice(0, -1);
  const decimalSeparator = new Intl.NumberFormat('en-KE').formatToParts(1.1)
    .find((part) => part.type === 'decimal')?.value ?? '.';
  const sign = isNegative ? '−' : '';
  const fraction = trimmedFraction ? `${decimalSeparator}${trimmedFraction}` : '';
  return `${sign}${groupedInteger(integerPart)}${fraction}`;
}

export function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatSignedCurrency(value: number, currency: string): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatCurrency(Math.abs(value), currency)}`;
}
