import { useEffect, useRef } from "react";

/**
 * Captures input from a USB/HID barcode scanner (keyboard-emulating).
 *
 * Scanners fire all characters of a barcode in rapid succession (typically
 * < 50 ms total) followed by an Enter keystroke. This hook attaches a
 * capture-phase listener to `document` so it intercepts keystrokes before
 * they reach any focused input element, buffers them, and fires `onScan`
 * when an Enter is received (or after a short inactivity timeout).
 *
 * When `enabled` is false the listener is detached and no side-effects occur.
 * While `enabled` is true ALL keyboard input is captured — turn off scan mode
 * before the user needs to type in form fields.
 */

const SCAN_TIMEOUT_MS = 80; // max gap between consecutive barcode chars

export function useBarcodeScanner({
  onScan,
  enabled,
  minLength = 3,
}: {
  onScan: (barcode: string) => void;
  enabled: boolean;
  minLength?: number;
}) {
  const bufferRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a stable ref so the effect doesn't re-run when onScan changes identity
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) {
      bufferRef.current = "";
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const flush = () => {
      const barcode = bufferRef.current.trim();
      bufferRef.current = "";
      timerRef.current = null;
      if (barcode.length >= minLength) {
        onScanRef.current(barcode);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        e.preventDefault();
        e.stopPropagation();
        flush();
        return;
      }

      if (e.key.length === 1) {
        // Swallow the keystroke so it doesn't land in any visible input
        e.preventDefault();
        e.stopPropagation();

        bufferRef.current += e.key;

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(flush, SCAN_TIMEOUT_MS);
      }
    };

    // Use capture phase so we intercept before React's synthetic event system
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      bufferRef.current = "";
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, minLength]);
}
