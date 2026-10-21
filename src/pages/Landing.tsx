import { ArrowRight } from "lucide-react";
import { NodusLogo } from "../components/NodusLogo";
import { StatusPill } from "../components/StatusPill";

// Sample rows from the real-estate demo template (src/data/templates.ts), shown with the
// app's own Italian field labels and currency format. Marked data-ui: it is an interface fragment.
const currency = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const sampleRows = [
  { reference: "SK-201", address: "18 Montagu Square, London", owner: "Clara Morgan", askingPrice: 2450000, status: "Listed" },
  { reference: "SK-202", address: "7 Holland Villas, London", owner: "James Park", askingPrice: 1890000, status: "Under offer" },
];

export function Landing({ onStart, onOpenConnected }: { onStart: () => void; onOpenConnected?: () => void }) {
  return <main className="landing">
    <nav className="nav" aria-label="NODUS">
      <a className="brand landing-lockup" href="#" aria-label="NODUS home"><NodusLogo variant="lockup"/></a>
      <span className="landing-tagline">THE INTELLIGENT OPERATING SYSTEM</span>
      <button className="text-button" onClick={onStart}>Crea workspace</button>
    </nav>
    <section className="hero" aria-labelledby="landing-title">
      <div className="hero-copy">
        <h1 id="landing-title"><span className="hero-line">La tua azienda,</span> <span className="hero-line">connessa con precisione.</span></h1>
        <p className="hero-lead">Descrivi come lavora la tua azienda ed esplora un gestionale costruito attorno ai tuoi processi.</p>
        <button className="primary large" onClick={onStart}>Progetta il tuo workspace <ArrowRight size={18}/></button>
        <p className="demo-disclosure">Demo locale: i dati restano in questo browser. La struttura iniziale è proposta da regole locali dichiarate, senza inviare la descrizione a un modello AI esterno.</p>
      </div>
      <div className="hero-stage">
        <div className="table-card landing-fragment" data-ui aria-label="Esempio di modulo Immobili, dati di esempio">
          <div className="landing-fragment-head"><strong>Immobili</strong><span>{sampleRows.length} record</span></div>
          <div className="table-scroll">
            <table>
              <thead><tr><th scope="col">Riferimento</th><th scope="col">Indirizzo</th><th scope="col">Proprietario</th><th scope="col" className="num">Prezzo richiesto</th><th scope="col">Stato</th></tr></thead>
              <tbody>{sampleRows.map((row, index) => <tr key={row.reference} className={index === 0 ? "selected" : undefined}>
                <td>{row.reference}</td><td>{row.address}</td><td>{row.owner}</td><td className="num"><strong>{currency.format(row.askingPrice)}</strong></td><td><StatusPill value={row.status}/></td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
    <section className="concept-flow" aria-labelledby="concept-flow-title">
      <h2 id="concept-flow-title">Dalla tua azienda al gestionale su misura</h2>
      <ol>
        <li><span className="concept-word">SCOPRI</span><strong>La tua azienda</strong><small>Persone, dati e processi</small></li>
        <li className="featured"><span className="concept-word">PROGETTA</span><strong>NODUS Architect</strong><small>Struttura proposta sui tuoi processi</small></li>
        <li><span className="concept-word">OPERA</span><strong>Il tuo gestionale</strong><small>Costruito sul tuo modo di lavorare</small></li>
      </ol>
    </section>
    <footer className="landing-footer">
      <div className="footer-statement"><p>Un unico sistema connesso. Interamente tuo.</p><p className="landing-tagline">STRUCTURE FOR WHAT MOVES YOU</p></div>
      <div className="footer-meta"><span>Progettato con cura · Pronto a evolvere</span>{onOpenConnected && <button className="landing-connected" onClick={onOpenConnected}>Workspace condiviso</button>}</div>
    </footer>
  </main>;
}
