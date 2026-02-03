export function pushError(errors, prefix, message) {
    errors.push(`${prefix}: ${message}`);
}
