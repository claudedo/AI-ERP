import { ArrowRight } from "lucide-react";
import { NodusLogo } from "../components/NodusLogo";

export function Landing({ onStart }: { onStart: () => void }) {
  return <main className="landing">
    <nav className="nav"><a className="brand" href="#" aria-label="NODUS home"><NodusLogo variant="lockup"/></a><button className="text-button" onClick={onStart}>Crea workspace</button></nav>
    <section className="hero">
      <div className="hero-identity"><NodusLogo variant="lockup"/><span>THE INTELLIGENT OPERATING SYSTEM</span></div>
      <div className="eyebrow">STRUCTURE FOR WHAT MOVES YOU</div>
      <h1>La tua azienda, connessa con precisione.</h1>
      <p>Descrivi come lavora la tua azienda ed esplora un gestionale costruito attorno ai tuoi processi.</p>
      <p className="demo-disclosure">Demo locale: i dati restano in questo browser. La struttura iniziale è proposta da regole locali dichiarate, senza inviare la descrizione a un modello AI esterno.</p>
      <button className="primary large" onClick={onStart}>Progetta il tuo workspace <ArrowRight size={18}/></button>
      <div className="concept-flow" aria-label="Dalla tua azienda al gestionale su misura">
        <div><span>01 / SCOPRI</span><strong>La tua azienda</strong><small>Persone, dati e processi</small></div><i>→</i>
        <div className="featured"><span>02 / PROGETTA</span><strong>NODUS Architect</strong><small>Struttura proposta sui tuoi processi</small></div><i>→</i>
        <div><span>03 / OPERA</span><strong>Il tuo gestionale</strong><small>Costruito sul tuo modo di lavorare</small></div>
      </div>
    </section>
    <footer className="landing-footer"><span>Un unico sistema connesso. Interamente tuo.</span><span>Progettato con cura · Pronto a evolvere</span></footer>
  </main>;
}
