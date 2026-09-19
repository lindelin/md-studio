// netmd-js uses Node's util.inspect only for debug logging. Keeping that
// compatibility surface small avoids pulling the full Node util polyfill into
// the browser and makes USB failures report their original error.
export function inspect(value: unknown): string {
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value, (_key, item: unknown) => {
      if (item instanceof Uint8Array) {
        return Array.from(item, byte => byte.toString(16).padStart(2, '0')).join(' ');
      }
      if (item instanceof ArrayBuffer) {
        return Array.from(new Uint8Array(item), byte => byte.toString(16).padStart(2, '0')).join(' ');
      }
      return item;
    });
  } catch {
    return String(value);
  }
}
