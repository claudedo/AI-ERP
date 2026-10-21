/**
 * Italian, UI-safe wording for Supabase Auth outcomes. Provider text is never echoed:
 * redirect `error_description` values are attacker-controllable URL content.
 */
export interface AuthFailure { code?: string; status?: number; message?: string }
export interface AuthIssue { code: string; message: string }

export const EMAIL_NOT_CONFIRMED = "Conferma la tua email per continuare.";
// Anti-enumeration: the same answer whether or not an account exists for the address.
export const SIGNUP_NEUTRAL = "Se l'indirizzo è valido e non ancora registrato, riceverai un'email di conferma.";
export const LINK_NEUTRAL = "Se esiste un account con questa email, riceverai un link di accesso.";
const RATE_LIMITED = "Troppi tentativi. Attendi qualche minuto e riprova.";
const rateLimited = (error: AuthFailure) => error.status === 429 || /^over_.*rate_limit$/.test(error.code || "");

/** Confirmation links return to the connected route with a marker for the "email confermata" notice. */
export const signupRedirect = (origin: string) => `${origin}/?mode=connected&flow=signup`;
export const connectedRedirect = (origin: string) => `${origin}/?mode=connected`;

export function signUpMessage(error: AuthFailure): string {
  if (error.code === "user_already_exists" || error.code === "email_exists") return SIGNUP_NEUTRAL;
  if (error.code === "weak_password") return "La password è troppo debole: usa almeno 8 caratteri, combinando lettere e numeri.";
  if (rateLimited(error)) return RATE_LIMITED;
  if (error.code === "signup_disabled" || error.code === "email_provider_disabled") return "La registrazione non è attiva su questo ambiente. Contatta l'amministratore di NODUS.";
  if (error.code === "email_address_invalid" || error.code === "validation_failed") return "Indirizzo email non valido.";
  if (error.code === "email_address_not_authorized") return "Il servizio email di prova non può scrivere a questo indirizzo. Usa un indirizzo autorizzato o configura un SMTP dedicato.";
  return "Registrazione non riuscita. Riprova tra poco.";
}

export function signInMessage(error: AuthFailure, method: "password" | "link" = "password"): string {
  if (rateLimited(error)) return RATE_LIMITED;
  // A magic link for an unknown address fails with these codes: answer exactly like a success.
  if (method === "link" && ["otp_disabled", "signup_disabled", "user_not_found"].includes(error.code || "")) return LINK_NEUTRAL;
  if (error.code === "email_not_confirmed") return EMAIL_NOT_CONFIRMED;
  if (error.code === "invalid_credentials") return "Email o password non corrette.";
  return "Accesso non riuscito. Riprova tra poco.";
}

/**
 * With confirmation ON, Supabase answers an already registered email with a user without identities;
 * it is deliberately treated like a fresh sign-up so the UI never discloses that the account exists.
 */
export function signUpOutcome(data: { user: { identities?: unknown[] } | null; session: unknown }): "confirm_email" | "signed_in" {
  return data.session ? "signed_in" : "confirm_email";
}

export function authRedirectIssue(href: string): AuthIssue | null {
  const url = new URL(href), params = new URLSearchParams(url.hash.replace(/^#/, ""));
  url.searchParams.forEach((value, key) => { if (!params.has(key)) params.set(key, value); });
  const code = params.get("error_code") || params.get("error");
  if (!code) return null;
  if (code === "otp_expired") return { code, message: "Il link è scaduto o è già stato usato. Se era un invito, chiedi all'amministratore di inviarne uno nuovo; altrimenti richiedi un nuovo link di accesso." };
  return { code, message: "Il link non è valido. Richiedi un nuovo link di accesso oppure un nuovo invito all'amministratore." };
}

/** Identity-provider redirects (invites, magic links, errors) that must open connected mode. */
export const isAuthRedirect = (hash: string) => /(?:^#|&)(?:access_token|error_code|error)=/.test(hash);
