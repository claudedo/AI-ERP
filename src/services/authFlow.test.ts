import { describe, expect, it } from "vitest";
import { EMAIL_NOT_CONFIRMED, authRedirectIssue, isAuthRedirect, signInMessage, signUpMessage, signUpOutcome, signupRedirect } from "./authFlow";

describe("self-service sign-up messages", () => {
  it("surfaces an already registered email clearly", () => {
    expect(signUpMessage({ code: "user_already_exists" })).toMatch(/^Email già registrata/);
    expect(signUpMessage({ code: "email_exists" })).toMatch(/^Email già registrata/);
    // With confirmation ON, Supabase answers an existing email with an empty identities list.
    expect(signUpOutcome({ user: { identities: [] }, session: null })).toBe("already_registered");
    expect(signUpOutcome({ user: { identities: [{}] }, session: null })).toBe("confirm_email");
    expect(signUpOutcome({ user: { identities: [{}] }, session: {} })).toBe("signed_in");
  });
  it("maps weak passwords, rate limits and disabled sign-up to Italian guidance", () => {
    expect(signUpMessage({ code: "weak_password" })).toMatch(/password/i);
    expect(signUpMessage({ code: "over_email_send_rate_limit" })).toMatch(/Troppi tentativi/);
    expect(signUpMessage({ status: 429 })).toMatch(/Troppi tentativi/);
    expect(signUpMessage({ code: "signup_disabled" })).toMatch(/non è attiva/);
    expect(signUpMessage({ code: "something_new", message: "raw provider text" })).not.toContain("raw provider text");
  });
  it("asks to confirm the email when signing in before confirmation", () => {
    expect(signInMessage({ code: "email_not_confirmed" })).toBe(EMAIL_NOT_CONFIRMED);
    expect(EMAIL_NOT_CONFIRMED).toBe("Conferma la tua email per continuare.");
    expect(signInMessage({ code: "invalid_credentials" })).toBe("Email o password non corrette.");
  });
  it("redirects confirmation emails to the connected confirmation route of this origin", () => {
    expect(signupRedirect("http://localhost:5173")).toBe("http://localhost:5173/?mode=connected&flow=signup");
  });
});

describe("auth redirect errors", () => {
  it("explains expired or reused invitation links without echoing provider text", () => {
    const issue = authRedirectIssue("https://nodus.test/?mode=connected#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    expect(issue?.code).toBe("otp_expired");
    expect(issue?.message).toMatch(/scaduto/);
    expect(issue?.message).not.toMatch(/Email link/);
  });
  it("reads errors from the query string as well and ignores clean URLs", () => {
    expect(authRedirectIssue("https://nodus.test/?mode=connected&error=access_denied&error_code=bad_jwt")?.message).toMatch(/non è valido/);
    expect(authRedirectIssue("https://nodus.test/?mode=connected")).toBeNull();
    expect(authRedirectIssue("https://nodus.test/#access_token=abc&type=invite")).toBeNull();
  });
  it("recognizes identity-provider redirects that should open connected mode", () => {
    expect(isAuthRedirect("#access_token=abc&type=invite")).toBe(true);
    expect(isAuthRedirect("#error=access_denied&error_code=otp_expired")).toBe(true);
    expect(isAuthRedirect("#workspace/dashboard")).toBe(false);
    expect(isAuthRedirect("")).toBe(false);
  });
});
