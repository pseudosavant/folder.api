export function pushError(errors: string[], prefix: string, message: string) {
  errors.push(`${prefix}: ${message}`);
}
