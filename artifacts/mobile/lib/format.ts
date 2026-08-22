/**
 * Formats a monetary amount using whatever currency label is configured in
 * Settings — see artifacts/web/src/lib/utils.ts for the same logic on web.
 * This is display-only: NOT a live currency/exchange-rate system. Every
 * amount is already stored as a plain number; this only controls how that
 * number is *labeled*. setCurrencyDisplay is called once at app root (see
 * app/_layout.tsx) when pharmacy settings load, so every formatCurrency()
 * call anywhere in the app picks up the current label automatically.
 * Accepts the string amounts the API returns (numeric() columns serialize
 * as strings) as well as plain numbers.
 */
let currencyDisplay: { symbol: string; position: 'prefix' | 'suffix' } = { symbol: '$', position: 'prefix' };

export function setCurrencyDisplay(symbol: string, position: 'prefix' | 'suffix') {
  currencyDisplay = { symbol: symbol || '$', position: position === 'suffix' ? 'suffix' : 'prefix' };
}

export function formatCurrency(amount: string | number | null | undefined): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount ?? 0;
  const safeValue = Number.isFinite(value) ? value : 0;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeValue);
  return currencyDisplay.position === 'prefix'
    ? `${currencyDisplay.symbol}${formatted}`
    : `${formatted} ${currencyDisplay.symbol}`;
}

/** Pulls a human-readable message out of an ApiError (or any thrown value)
 * so failures can be surfaced to the user instead of swallowed.
 * Mirrors artifacts/web/src/lib/errors.ts so mobile never shows the raw
 * "HTTP 409 Conflict: …" text the shared api-client throws internally. */
export function getErrorMessage(error: unknown): string {
  if (!error) return 'Something went wrong. Please try again.';

  // ApiError from the shared custom fetch — `data` is the parsed JSON body,
  // which usually has a clean `error`/`detail`/`message` field from the server.
  if (typeof error === 'object' && 'data' in error) {
    const data = (error as any).data;
    if (data && typeof data === 'object') {
      if (typeof data.error === 'string' && data.error) return data.error;
      if (typeof data.detail === 'string' && data.detail) return data.detail;
      if (typeof data.message === 'string' && data.message) return data.message;
    }
  }

  if (error instanceof Error) {
    // Strip the "HTTP 4xx Bad Request: " prefix that ApiError adds
    const cleaned = error.message.replace(/^HTTP \d{3}[^:]*:\s*/, '');
    return cleaned || 'Something went wrong. Please try again.';
  }

  return 'Something went wrong. Please try again.';
}
