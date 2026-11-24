export function formatCurrency(value: string | number, currency: string): string {
  const amount = typeof value === 'number' ? value : Number(value);
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatQuantity(value: string | number): string {
  const amount = typeof value === 'number' ? value : Number(value);
  return new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(Number.isFinite(amount) ? amount : 0);
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
