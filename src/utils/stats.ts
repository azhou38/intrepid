export function flag(code: string): string {
  if (!code || code.length !== 2) return '🏳️';
  const offset = 0x1f1e6 - 65;
  return (
    String.fromCodePoint(code.toUpperCase().charCodeAt(0) + offset) +
    String.fromCodePoint(code.toUpperCase().charCodeAt(1) + offset)
  );
}
