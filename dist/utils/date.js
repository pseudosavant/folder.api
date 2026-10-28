const datePatterns = [
    /\b(\d{4})-(\d{2})-(\d{2})/i,
    /\b(\d{1,2})-([a-z]{3})-(\d{4})/i,
    /\b(\d{1,2})\/(\d{1,2})\/(\d{4})/i
];
const clockPattern = /^(?:T|\s+)(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/i;
const remainingMetadata = /^\s+(?:\d+(?:,\d{3})*(?:\.\d+)?\s*(?:[KMGTP](?:i?B)?|B|bytes?)?|<dir>|-)\s*$/i;
export function parseDateMeta(text, errors) {
    return parseDateMetadata(text, errors)?.value ?? null;
}
export function parseDateMetadata(text, errors) {
    const matches = datePatterns.map((pattern, family) => ({ match: pattern.exec(text), family }))
        .filter((candidate) => candidate.match !== null)
        .sort((a, b) => a.match.index - b.match.index);
    if (matches.length === 0) {
        if (/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/.test(text))
            errors.push('date: ambiguous numeric date pattern');
        return null;
    }
    const { match, family } = matches[0];
    const year = +(family === 0 ? match[1] : match[3]);
    const month = family === 1
        ? ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(match[2].toLowerCase()) + 1
        : +(family === 0 ? match[2] : match[1]);
    const day = +(family === 0 ? match[3] : family === 1 ? match[1] : match[2]);
    let end = match.index + match[0].length;
    const clock = clockPattern.exec(text.slice(end));
    if (clock)
        end += clock[0].length;
    else if (family === 1 || /^(?:T|\s+\d+:)/i.test(text.slice(end)))
        return invalidDate(errors);
    const meridiem = clock ? /^\s*(AM|PM)\b/i.exec(text.slice(end)) : null;
    if (meridiem)
        end += meridiem[0].length;
    if (family === 2 && (!clock || !meridiem)) {
        errors.push('date: ambiguous numeric date pattern');
        return null;
    }
    const zone = clock ? /^\s*(Z|[+-]\d{2}:?\d{2})(?![\da-z])/i.exec(text.slice(end)) : null;
    if (zone)
        end += zone[0].length;
    const remainder = text.slice(end);
    if (remainder.trim() && !remainingMetadata.test(remainder))
        return invalidDate(errors);
    let hour = +(clock?.[1] || 0);
    if (meridiem) {
        if (hour < 1 || hour > 12)
            return invalidDate(errors);
        hour = hour % 12 + (/pm/i.test(meridiem[1]) ? 12 : 0);
    }
    const value = validatedDate(year, month, day, hour, +(clock?.[2] || 0), +(clock?.[3] || 0), +(clock?.[4] || '').padEnd(3, '0').slice(0, 3), zone?.[1] || '', errors);
    return value === null ? null : { value, raw: text.slice(match.index, end).trim(),
        timezone: zone ? 'explicit' : 'assumed-utc', start: match.index, end };
}
function validatedDate(year, month, day, hour, minute, second, millisecond, zone, errors) {
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59)
        return invalidDate(errors);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, millisecond);
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
        return invalidDate(errors);
    if (zone && zone.toUpperCase() !== 'Z') {
        const digits = zone.slice(1).replace(':', '');
        const hours = +digits.slice(0, 2);
        const minutes = +digits.slice(2);
        if (hours > 23 || minutes > 59)
            return invalidDate(errors);
        date.setTime(date.getTime() - (hours * 60 + minutes) * (zone[0] === '+' ? 1 : -1) * 60000);
    }
    return date.toISOString();
}
function invalidDate(errors) {
    errors.push('date: invalid date or time');
    return null;
}
export function stripDateTime(text) {
    const date = parseDateMetadata(text, []);
    return date ? text.slice(0, date.start) + text.slice(date.end) : text;
}
