import { PitchDisplay } from "./components/PitchDisplay";
import "./App.css";

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="logo">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
            </svg>
          </div>
          <div>
            <h1>VoxTrainer</h1>
            <p className="subtitle">Vocal Training</p>
          </div>
        </div>
      </header>
      <main className="app-main">
        <PitchDisplay />
      </main>
    </div>
  );
}

export default App;
