const isoPattern = /\b(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?)?\b/i;
const apachePattern = /\b(\d{1,2})-([a-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\b/i;
const usPattern = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\b/i;
const isoGlobalPattern = new RegExp(isoPattern.source, 'gi');
const apacheGlobalPattern = new RegExp(apachePattern.source, 'gi');

export function parseDateMeta(text: string, errors: string[]): string | null {
  const iso = isoPattern.exec(text);
  if (iso) {
    const remainder = text.slice(iso.index + iso[0].length);
    if (/^(?:[:.]|[+-]\d|Z\b)/i.test(remainder)
      || (!iso[4] && /^(?:T|\s+\d+:)/i.test(remainder))
      || (iso[4] && /^\s+[+-]\d/.test(remainder))) return invalidDate(errors);
    return validatedDate(+iso[1], +iso[2], +iso[3], +(iso[4] || 0), +(iso[5] || 0), +(iso[6] || 0),
      +(iso[7] || '').padEnd(3, '0').slice(0, 3), iso[8] || '', errors);
  }
  const apache = apachePattern.exec(text);
  if (apache) {
    if (/^[:.]/.test(text.slice(apache.index + apache[0].length))) return invalidDate(errors);
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(apache[2].toLowerCase()) + 1;
    return validatedDate(+apache[3], month, +apache[1], +apache[4], +apache[5], +(apache[6] || 0), 0, '', errors);
  }
  const us = usPattern.exec(text);
  if (us) {
    const hour = +us[4];
    if (hour < 1 || hour > 12) return invalidDate(errors);
    return validatedDate(+us[3], +us[1], +us[2], hour % 12 + (/pm/i.test(us[7]) ? 12 : 0), +us[5], +(us[6] || 0), 0, '', errors);
  }
  if (/\b\d{4}-\d{2}-\d{2}T/i.test(text)) return invalidDate(errors);
  if (/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/.test(text)) errors.push('date: ambiguous numeric date pattern');
  return null;
}

function validatedDate(year: number, month: number, day: number, hour: number, minute: number, second: number, millisecond: number, zone: string, errors: string[]): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return invalidDate(errors);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return invalidDate(errors);
  if (zone && zone.toUpperCase() !== 'Z') {
    const digits = zone.slice(1).replace(':', '');
    const hours = +digits.slice(0, 2);
    const minutes = +digits.slice(2);
    if (hours > 23 || minutes > 59) return invalidDate(errors);
    const offset = (hours * 60 + minutes) * (zone[0] === '+' ? 1 : -1);
    date.setTime(date.getTime() - offset * 60000);
  }
  return date.toISOString();
}

function invalidDate(errors: string[]): null {
  errors.push('date: invalid date or time');
  return null;
}

export function stripDateTime(text: string): string {
  return text
    .replace(isoGlobalPattern, '')
    .replace(apacheGlobalPattern, '')
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\b/gi, '');
}
