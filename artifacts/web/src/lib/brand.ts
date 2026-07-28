// Central PharmaCore product brand constants.
//
// These are the *software* brand — completely separate from each pharmacy's
// own name/logo, which is stored in the pharmacy_settings table and used
// only on receipts and dispensing slips.
//
// import.meta.env.BASE_URL includes a trailing slash in Vite, so we strip it
// before appending the path so we never produce double slashes.
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export const BRAND = {
  name: "PharmaCore",
  tagline: "Smart Pharmacy. Better Care.",
  /** Full square logo (icon mark + wordmark + tagline) served from public/logo.png */
  logoUrl: `${base}/logo.png`,
} as const;
