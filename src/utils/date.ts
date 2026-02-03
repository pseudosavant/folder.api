// Date parsing heuristics -> returns ISO 8601 UTC string or null, pushes errors when ambiguous
export function parseDateMeta(text: string, errors: string[]): string | null {
  const t = text;
  // 1. ISO-ish YYYY-MM-DD[ T]HH:MM(:SS)?
  let m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(t);
  if (m) {
    const [ , Y, Mo, D, H, Mi, S] = m;
    const date = new Date(Date.UTC(Number(Y), Number(Mo)-1, Number(D), Number(H), Number(Mi), Number(S ?? '0')));
    return date.toISOString();
  }
  // 2. DD-Mon-YYYY HH:MM (Apache style)
  m = /(\d{2})-(\w{3})-(\d{4})\s(\d{2}):(\d{2})/.exec(t);
  if (m) {
    const [ , D, Mon, Y, H, Mi] = m;
    const monthIndex = shortMonthToIndex(Mon);
    if (monthIndex != null) {
      return new Date(Date.UTC(Number(Y), monthIndex, Number(D), Number(H), Number(Mi), 0)).toISOString();
    }
  }
  // 3. US M/D/YYYY HH:MM( AM| PM)
  m = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s(\d{1,2}):(\d{2})(?:\s?(AM|PM))/i.exec(t);
  if (m) {
    const [ , M, D, Y, Hh, Mi, ap] = m;
    let H = Number(Hh);
    if (ap) {
      if (/am/i.test(ap)) {
        if (H === 12) H = 0; // midnight
      } else if (/pm/i.test(ap)) {
        if (H !== 12) H += 12;
      }
    }
    return new Date(Date.UTC(Number(Y), Number(M)-1, Number(D), H, Number(Mi), 0)).toISOString();
  }
  // Ambiguous purely numeric? treat unknown
  if (/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/.test(t)) {
    errors.push('date: ambiguous numeric date pattern');
  }
  return null;
}

function shortMonthToIndex(mon: string): number | null {
  const idx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(mon.toLowerCase());
  return idx >=0 ? idx : null;
}
