export function compactId(value: string | null | undefined): string {
  if (!value) {
    return 'None';
  }
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export function percent(numerator: number, denominator: number): string {
  if (denominator === 0) {
    return '0%';
  }
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function labelFromKey(value: string | null | undefined): string {
  if (!value) {
    return 'None';
  }
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
