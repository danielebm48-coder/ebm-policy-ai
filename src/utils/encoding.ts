export function normalizeText(input: string): string {
  if (!input) return input;
  // Detect common mojibake patterns and try latin1 -> utf8 conversion
  if (/Ã[\x80-\xBF]|Â[\x80-\xBF]/.test(input)) {
    try {
      return Buffer.from(input, 'latin1').toString('utf8').trim();
    } catch (e) {
      return input;
    }
  }
  return input.trim();
}
