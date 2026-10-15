import logo from "../assets/logo.png";

interface WelcomeScreenProps {
  onEnter: () => void;
}

export function WelcomeScreen({ onEnter }: WelcomeScreenProps) {
  return (
    <main className="welcome-page">
      <div className="welcome-glow welcome-glow-top" aria-hidden="true" />
      <div className="welcome-glow welcome-glow-bottom" aria-hidden="true" />

      <section className="welcome-content" aria-labelledby="welcome-title">
        <span className="welcome-mark" aria-hidden="true">
          <img src={logo} alt="" />
        </span>
        <h1 id="welcome-title">PrimerAI</h1>
        <p className="welcome-message">
          Sua inteligência para fazer mais, com menos esforço.
        </p>
        <button className="welcome-enter-button" type="button" onClick={onEnter}>
          Entrar
        </button>
      </section>
    </main>
  );
}
