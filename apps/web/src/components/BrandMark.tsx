import { Gem } from "lucide-react";

interface BrandMarkProps {
  size?: "small" | "large";
}

export function BrandMark({ size = "small" }: BrandMarkProps) {
  return (
    <span className={`brand-mark brand-mark--${size}`} aria-hidden="true">
      <Gem size={size === "large" ? 21 : 17} strokeWidth={1.8} />
    </span>
  );
}
