// Size must be a metadata field, not a number embedded in a filename or date.
import { stripDateTime } from './date.js';

export function parseSizeMeta(text: string): number | null {
  const metadata = stripDateTime(text).trim();
  const match = /^(\d+(?:,\d{3})*(?:\.\d+)?)\s*([KMGTP](?:i?B)?|B|bytes?)?$/i.exec(metadata);
  if (!match) return null;
  const unit = (match[2] || '').toUpperCase();
  const power = unit && !unit.startsWith('B') ? 'KMGTP'.indexOf(unit[0]) + 1 : 0;
  const bytes = Number(match[1].replace(/,/g, '')) * Math.pow(1024, power);
  return Number.isFinite(bytes) ? Math.floor(bytes) : null;
}
