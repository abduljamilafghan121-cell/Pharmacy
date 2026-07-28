import { BRAND } from "@/lib/brand";

export function PharmacyBrand({ className = "h-8" }: { className?: string }) {
  return (
    <img
      src={BRAND.logoUrl}
      alt={BRAND.name}
      className={`w-auto object-contain ${className}`}
    />
  );
}
