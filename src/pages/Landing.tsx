import { ArrowRight, Blocks, Sparkles } from "lucide-react";

export function Landing({ onStart }: { onStart: () => void }) {
  return <main className="landing">
    <nav className="nav"><a className="brand" href="#"><span className="brand-mark"><Blocks size={17}/></span>AI Business OS</a><button className="text-button" onClick={onStart}>Sign in</button></nav>
    <section className="hero">
      <div className="eyebrow"><Sparkles size={14}/> The adaptive business platform</div>
      <h1>Build the software your business actually needs.</h1>
      <p>Describe how your company works. AI designs, builds and evolves your management system.</p>
      <button className="primary large" onClick={onStart}>Create your workspace <ArrowRight size={18}/></button>
      <div className="concept-flow" aria-label="Business to custom software process">
        <div><span>01</span><strong>Your business</strong><small>People, data, processes</small></div><i>→</i>
        <div className="featured"><span>02</span><strong>AI Architect</strong><small>Understands & designs</small></div><i>→</i>
        <div><span>03</span><strong>Custom software</strong><small>Built around your work</small></div>
      </div>
    </section>
    <footer className="landing-footer"><span>One system. Shaped around your company.</span><span>Private by design · No setup required</span></footer>
  </main>;
}
