// exporter.ts — Export utilities for businesslog.ai analytics

import type { ExportFormat } from './types.js';

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/**
 * Escape a single value for safe inclusion in a CSV cell.
 *
 * - Wraps the value in double quotes if it contains commas, quotes, or newlines.
 * - Doubles any existing double quotes per RFC 4180.
 */
function escapeCsvValue(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Flatten a nested object into a single-level record suitable for CSV rows.
 *
 * Nested paths are joined with dots (e.g. `{ a: { b: 1 } }` becomes `"a.b": "1"`).
 * Dates are converted to ISO strings.
 */
function flattenObject(
  obj: Record<string, unknown>,
  prefix = '',
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (value instanceof Date) {
      result[path] = value.toISOString();
    } else if (value !== null && typeof value === 'object') {
      Object.assign(result, flattenObject(value as Record<string, unknown>, path));
    } else {
      result[path] = String(value ?? '');
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert an array of objects to a CSV string.
 *
 * Column headers are derived from the keys of the first object. Objects are
 * flattened so nested values appear under dot-separated column names.
 */
export function exportToCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';

  const flatRows = data.map((row) => flattenObject(row));

  // Collect all unique headers across every row to avoid missing columns.
  const headerSet = new Set<string>();
  for (const row of flatRows) {
    for (const key of Object.keys(row)) {
      headerSet.add(key);
    }
  }
  const headers = Array.from(headerSet);

  const headerLine = headers.map(escapeCsvValue).join(',');
  const dataLines = flatRows.map((row) =>
    headers.map((h) => escapeCsvValue(row[h] ?? '')).join(','),
  );

  return [headerLine, ...dataLines].join('\n');
}

/**
 * Serialize any value to a pretty-printed JSON string.
 *
 * Dates are converted to ISO strings during serialization via a replacer.
 */
export function exportToJSON(data: unknown): string {
  return JSON.stringify(data, (key, value) => {
    if (value instanceof Date) return value.toISOString();
    return value;
  }, 2);
}

/**
 * Build a Content-Disposition header value for a file download.
 *
 * @param filename - Base file name without extension.
 * @param format   - The export format, used to append the correct extension.
 * @returns The full header value, e.g. `attachment; filename="report.csv"`.
 */
export function setContentDispositionHeader(
  filename: string,
  format: ExportFormat,
): string {
  const extension = format === 'csv' ? 'csv' : 'json';
  return `attachment; filename="${filename}.${extension}"`;
}
