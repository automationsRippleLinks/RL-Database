// Fields with these names should not be included in logs.
const sensitiveKey =
  /password|token|authorization|cookie|secret|email|phone|request.?body|response.?body/i;

// Clean text found inside errors and other telemetry.
function cleanText(text: string): string {
  return text
    // Remove query parameters and fragments from full URLs.
    // Example: https://site.com/search?email=abc → https://site.com/search
    .replace(/https?:\/\/[^\s"<>]+/gi, (value) => {
      try {
        const url = new URL(value);
        return `${url.origin}${url.pathname}`;
      } catch {
        return '[url removed]';
      }
    })

    // Hide email addresses found inside messages.
    .replace(
      /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,
      '[email removed]',
    )

    // Hide bearer tokens found inside messages.
    .replace(/Bearer\s+\S+/gi, 'Bearer [removed]')

    // Hide common secret values written as "token=value".
    .replace(
      /((?:password|token|secret|cookie|authorization)\s*[:=]\s*)[^\s,;]+/gi,
      '$1[removed]',
    );
}

// Walk through the telemetry and clean its fields.
// This returns a new value instead of changing the original object.
export function sanitizeTelemetry(value: unknown): unknown {
  if (typeof value === 'string') {
    return cleanText(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeTelemetry);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKey.test(key)
          ? '[removed]'
          : sanitizeTelemetry(item),
      ]),
    );
  }

  // Keep numbers, booleans and null unchanged.
  return value;
}