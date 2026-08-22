import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Display-only currency label. NOT a live currency/exchange-rate system —
// every amount is already stored in the database as a plain number; this
// only controls how that number is *labeled* wherever it's shown. Synced
// from pharmacy settings once at app root (see CurrencySync in App.tsx) so
// every formatCurrency() call anywhere in the app picks it up automatically.
let currencyDisplay: { symbol: string; position: 'prefix' | 'suffix' } = { symbol: '$', position: 'prefix' };

export function setCurrencyDisplay(symbol: string, position: 'prefix' | 'suffix') {
  currencyDisplay = { symbol: symbol || '$', position: position === 'suffix' ? 'suffix' : 'prefix' };
}

export function formatCurrency(amount: string | number) {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(isNaN(value) ? 0 : value);
  return currencyDisplay.position === 'prefix'
    ? `${currencyDisplay.symbol}${formatted}`
    : `${formatted} ${currencyDisplay.symbol}`;
}

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
