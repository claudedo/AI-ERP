import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EMAIL_NOT_CONFIRMED, LINK_NEUTRAL, SIGNUP_NEUTRAL, connectedRedirect, signInMessage, signUpMessage, signUpOutcome, signupRedirect, type AuthIssue } from "../services/authFlow";

type Mode = "signin" | "signup" | "check-email";
const field = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) || "").trim();

/** Re-sends the sign-up confirmation email; Supabase applies its own send rate limit. */
export function ResendConfirmation({ auth, email }: { auth: SupabaseClient; email: string }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
  return (
    <div className="auth-actions">
      <button type="button" className="secondary" disabled={busy || !email} onClick={async () => {
        setBusy(true);
        const { error } = await auth.auth.resend({ type: "signup", email, options: { emailRedirectTo: signupRedirect(location.origin) } });
        setBusy(false); setFailed(!!error);
        setMessage(error ? signUpMessage(error) : "Ti abbiamo inviato una nuova email di conferma.");
      }}>Reinvia email di conferma</button>
      {message && <p role={failed ? "alert" : "status"} className={failed ? "auth-error" : "auth-note"}>{message}</p>}
    </div>
  );
}

export function ConnectedAuth({ auth, issue, onClose }: { auth: SupabaseClient; issue: AuthIssue | null; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("signin"), [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(issue?.message || ""), [notice, setNotice] = useState("");
  const switchTo = (next: Mode) => { setMode(next); setError(""); setNotice(""); };

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget, address = field(form, "email"), password = String(new FormData(form).get("password") || "");
    const viaLink = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "link";
    setEmail(address); setError(""); setNotice("");
    if (!viaLink && !password) { setError("Inserisci la password oppure richiedi un link di accesso via email."); return; }
    setBusy(true);
    const { error } = viaLink
      ? await auth.auth.signInWithOtp({ email: address, options: { shouldCreateUser: false, emailRedirectTo: connectedRedirect(location.origin) } })
      : await auth.auth.signInWithPassword({ email: address, password });
    setBusy(false);
    const message = error ? signInMessage(error, viaLink ? "link" : "password") : viaLink ? LINK_NEUTRAL : "";
    if (message === LINK_NEUTRAL) { setNotice(LINK_NEUTRAL); return; }
    if (message === EMAIL_NOT_CONFIRMED) setMode("check-email");
    if (message) setError(message);
  };

  const signUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget, address = field(form, "email"), name = field(form, "name"), company = field(form, "company");
    const password = String(new FormData(form).get("password") || "");
    setEmail(address); setError(""); setNotice(""); setBusy(true);
    const { data, error } = await auth.auth.signUp({ email: address, password, options: { emailRedirectTo: signupRedirect(location.origin), data: { name, company } } });
    setBusy(false);
    const message = error ? signUpMessage(error) : "";
    // Existing and new addresses take the same path: the neutral "check your email" screen.
    if (message && message !== SIGNUP_NEUTRAL) { setError(message); return; }
    if (error || signUpOutcome(data) === "confirm_email") setMode("check-email");
  };

  return (
    <main className="connected-shell auth-panel">
      <h1>{mode === "signup" ? "Crea il tuo account NODUS" : mode === "check-email" ? "Conferma la tua email" : "Accedi a NODUS"}</h1>
      {mode !== "check-email" && (
        <div className="auth-tabs" role="group" aria-label="Accesso o registrazione">
          <button type="button" className="auth-tab" aria-pressed={mode === "signin"} onClick={() => switchTo("signin")}>Ho già un account</button>
          <button type="button" className="auth-tab" aria-pressed={mode === "signup"} onClick={() => switchTo("signup")}>Registrati</button>
        </div>
      )}
      {error && <p role="alert" className="auth-error">{error}</p>}
      {notice && <p role="status" className="auth-note">{notice}</p>}
      {mode === "signin" && (
        <form className="auth-form" onSubmit={signIn}>
          <p className="auth-note">Accedi con email e password, oppure ricevi un link di accesso. Se hai ricevuto un invito, apri il link nell'email.</p>
          <label>Email<input name="email" type="email" required autoComplete="email" defaultValue={email} /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" /></label>
          <div className="auth-actions">
            <button className="primary" value="password" disabled={busy}>Accedi</button>
            <button className="secondary" value="link" disabled={busy}>Invia link di accesso</button>
          </div>
        </form>
      )}
      {mode === "signup" && (
        <form className="auth-form" onSubmit={signUp}>
          <p className="auth-note">Crea l'account e la tua azienda. Riceverai un'email per confermare l'indirizzo; dopo la conferma sarai l'amministratore e potrai invitare i colleghi.</p>
          <label>Nome<input name="name" required maxLength={100} autoComplete="name" /></label>
          <label>Email<input name="email" type="email" required autoComplete="email" defaultValue={email} /></label>
          <label>Password<input name="password" type="password" required minLength={8} autoComplete="new-password" aria-describedby="password-hint" /></label>
          <p id="password-hint" className="auth-note">Almeno 8 caratteri.</p>
          <label>Nome azienda<input name="company" required minLength={2} maxLength={100} autoComplete="organization" /></label>
          <div className="auth-actions"><button className="primary" disabled={busy}>Crea account</button></div>
        </form>
      )}
      {mode === "check-email" && (
        <section className="auth-form">
          <p>{SIGNUP_NEUTRAL} Indirizzo: <strong>{email || "il tuo indirizzo"}</strong>. Apri l'email e conferma l'indirizzo per continuare: la tua azienda verrà creata al primo accesso.</p>
          <ResendConfirmation auth={auth} email={email} />
          <div className="auth-actions"><button type="button" className="secondary" onClick={() => switchTo("signin")}>Torna all'accesso</button></div>
        </section>
      )}
      <button type="button" className="secondary" onClick={onClose}>Demo locale</button>
    </main>
  );
}

/** Shown after a confirmed sign-in when the account has no organization yet. */
export function CompanySetup({ defaults, busy, onCreate }: { defaults: { company: string; name: string }; busy: boolean; onCreate: (company: string, name: string) => void }) {
  return (
    <form className="auth-form" onSubmit={event => { event.preventDefault(); onCreate(field(event.currentTarget, "company"), field(event.currentTarget, "name")); }}>
      <h2>Crea la tua azienda</h2>
      <p className="auth-note">Il tuo account non è ancora collegato a un'azienda. Creala ora: ne sarai l'amministratore e potrai invitare i colleghi. Se aspetti un invito, apri invece il link ricevuto via email.</p>
      <label>Nome azienda<input name="company" required minLength={2} maxLength={100} defaultValue={defaults.company} autoComplete="organization" /></label>
      <label>Il tuo nome<input name="name" required maxLength={100} defaultValue={defaults.name} autoComplete="name" /></label>
      <div className="auth-actions"><button className="primary" disabled={busy}>Crea azienda</button></div>
    </form>
  );
}
