const DEFAULT_ALLOWED_DOMAINS = ["surroundingsgroup.com", "nauticalnetwork.com"];

export function allowedEmailDomains(): string[] {
  const raw = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS;
  if (!raw) return DEFAULT_ALLOWED_DOMAINS;
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return allowedEmailDomains().includes(domain);
}
