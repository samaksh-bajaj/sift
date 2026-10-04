import type { Cell, Item } from './schemas';
export function normalizeUrl(input: string): string {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Unsupported page URL');
  url.hash = '';
  url.username = '';
  url.password = '';
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}
export function findDuplicate(
  items: Item[],
  projectId: string,
  url: string,
  hash: string,
): Item | undefined {
  return items.find(
    (i) =>
      i.projectId === projectId &&
      (normalizeUrl(i.canonicalUrl ?? i.sourceUrl) === normalizeUrl(url) ||
        i.contentHash === hash),
  );
}
export function estimatedCost(
  input: number,
  output: number,
  inputRate = 0.1,
  outputRate = 0.4,
): number {
  if (
    [input, output, inputRate, outputRate].some(
      (n) => !Number.isFinite(n) || n < 0,
    )
  )
    throw new Error('Invalid token usage or pricing');
  return (input * inputRate + output * outputRate) / 1_000_000;
}
export function displayValue(cell?: Cell): string {
  if (cell?.value == null) return 'Unknown';
  if (typeof cell.value === 'boolean') return cell.value ? 'Yes' : 'No';
  if (Array.isArray(cell.value)) return cell.value.join(', ');
  if (typeof cell.value === 'number' && cell.currency)
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: cell.currency,
      maximumFractionDigits: 2,
    }).format(cell.value);
  return String(cell.value);
}
export function safeSpreadsheetText(value: string): string {
  return /^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value;
}
