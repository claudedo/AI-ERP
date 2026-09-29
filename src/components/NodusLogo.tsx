type NodusLogoVariant = "mark" | "wordmark" | "lockup";

const sources: Record<NodusLogoVariant, string> = {
  mark: "/nodus-mark.svg",
  wordmark: "/nodus-wordmark.svg",
  lockup: "/nodus-lockup.svg",
};

export function NodusLogo({ variant = "lockup", className = "" }: { variant?: NodusLogoVariant; className?: string }) {
  return <img className={`nodus-logo nodus-logo--${variant} ${className}`.trim()} src={sources[variant]} alt={variant === "mark" ? "NODUS symbol" : "NODUS"} />;
}
