import { Pill } from "lucide-react";
import { usePharmacySettings } from "@/hooks/use-pharmacy-settings";

export function PharmacyBrand({ iconSize = 18, boxClassName = "w-8 h-8" }: { iconSize?: number; boxClassName?: string }) {
  const { data: pharmacy } = usePharmacySettings();
  return (
    <>
      <div className={`${boxClassName} rounded-lg bg-primary flex items-center justify-center text-primary-foreground overflow-hidden shrink-0`}>
        {pharmacy?.logoUrl ? (
          <img src={pharmacy.logoUrl} alt="" className="w-full h-full object-contain" />
        ) : (
          <Pill size={iconSize} />
        )}
      </div>
      <span className="truncate">{pharmacy?.name ?? "My Pharmacy"}</span>
    </>
  );
}
