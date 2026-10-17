import { ArrowRight } from "lucide-react";
import { NodusLogo } from "../components/NodusLogo";

export function Landing({ onStart }: { onStart: () => void }) {
  return <main className="landing">
    <nav className="nav"><a className="brand" href="#" aria-label="NODUS home"><NodusLogo variant="lockup"/></a><button className="text-button" onClick={onStart}>Create workspace</button></nav>
    <section className="hero">
      <div className="hero-identity"><NodusLogo variant="lockup"/><span>THE INTELLIGENT OPERATING SYSTEM</span></div>
      <div className="eyebrow">STRUCTURE FOR WHAT MOVES YOU</div>
      <h1>Your business, precisely connected.</h1>
      <p>Describe how your company works and explore a management system shaped around your processes.</p>
      <p className="demo-disclosure">Demo locale: i dati restano in questo browser. NODUS Architect usa regole locali dichiarate, senza un modello AI esterno o un workspace condiviso già attivo.</p>
      <button className="primary large" onClick={onStart}>Design your workspace <ArrowRight size={18}/></button>
      <div className="concept-flow" aria-label="Business to custom software process">
        <div><span>01 / DISCOVER</span><strong>Your business</strong><small>People, data and processes</small></div><i>→</i>
        <div className="featured"><span>02 / DESIGN</span><strong>NODUS Architect</strong><small>Structure shaped by AI</small></div><i>→</i>
        <div><span>03 / OPERATE</span><strong>Your operating system</strong><small>Built for the way you work</small></div>
      </div>
    </section>
    <footer className="landing-footer"><span>One connected system. Entirely your own.</span><span>Considered by design · Ready to evolve</span></footer>
  </main>;
}
