// Parses sizes in forms like 1, 1K, 1.2M, 4G, 12KB etc. Binary interpretation only.
// Strategy: strip common date/time patterns, ignore numbers embedded in words, then choose largest magnitude.
export function parseSizeMeta(text) {
    const cleaned = stripDateTime(text);
    const re = /(\d+(?:\.\d+)?)([KMGTP]?B?)/gi;
    const pow = { '': 0, 'B': 0, 'K': 1, 'KB': 1, 'M': 2, 'MB': 2, 'G': 3, 'GB': 3, 'T': 4, 'TB': 4, 'P': 5, 'PB': 5 };
    const tokens = [];
    let m;
    while ((m = re.exec(cleaned)) !== null) {
        const raw = m[0];
        const value = Number(m[1]);
        const unit = (m[2] || '').toUpperCase();
        const p = pow[unit];
        if (isNaN(value) || p === undefined)
            continue;
        if (isEmbeddedInWord(cleaned, m.index, raw.length))
            continue;
        // Skip tokens that are very likely part of a date year (4 digits followed by - or / nearby)
        if (/^\d{4}$/.test(raw)) {
            const idx = m.index;
            const surround = cleaned.slice(Math.max(0, idx - 5), Math.min(cleaned.length, idx + 6));
            if (/[\d]{4}[-/]/.test(surround))
                continue; // looks like YYYY- or YYYY/
        }
        const bytes = Math.floor(value * Math.pow(1024, p));
        tokens.push({ bytes, unit, raw, index: m.index });
    }
    if (tokens.length === 0)
        return null;
    // Prefer tokens that had a real unit (K/M/G/T/P) over plain numbers (possibly years)
    const withUnit = tokens.filter(t => /[KMGTP]/.test(t.unit));
    let candidateSet = withUnit;
    if (candidateSet.length === 0) {
        // Filter out tokens likely part of date/time (adjacent to ':' or '-')
        const nonDate = tokens.filter(t => {
            const before = cleaned[t.index - 1] || '';
            const after = cleaned[t.index + t.raw.length] || '';
            if (before === ':' || after === ':' || before === '-' || after === '-')
                return false;
            // Also discard if value <= 60 and there exists another ':' nearby implying HH:MM
            if (t.bytes <= 60) {
                const slice = cleaned.slice(Math.max(0, t.index - 5), Math.min(cleaned.length, t.index + 8));
                if (/\d{1,2}:\d{2}/.test(slice))
                    return false;
            }
            return true;
        });
        if (nonDate.length === 0)
            return null; // nothing that looks like a size
        candidateSet = nonDate;
    }
    const target = candidateSet.sort((a, b) => b.bytes - a.bytes)[0];
    return target.bytes;
}
function stripDateTime(text) {
    let out = text;
    out = out.replace(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?/g, ' ');
    out = out.replace(/\d{2}-\w{3}-\d{4}\s\d{2}:\d{2}/g, ' ');
    out = out.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}\s\d{1,2}:\d{2}(?:\s?(?:AM|PM))?/gi, ' ');
    return out;
}
function isEmbeddedInWord(text, index, length) {
    const before = text[index - 1] || '';
    const after = text[index + length] || '';
    return /[A-Za-z]/.test(before) || /[A-Za-z]/.test(after);
}
