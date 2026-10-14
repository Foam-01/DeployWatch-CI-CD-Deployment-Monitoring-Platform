export const CSV_EXPORT_MAX_ROWS = 10_000;

function escapeCsvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);

  if (typeof value === 'string' && /^[\u0000-\u0020]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
