// "http://a.com, http://b.com/" -> ["http://a.com", "http://b.com"]
export function parseOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);
}