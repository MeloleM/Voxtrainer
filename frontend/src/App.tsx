import { PitchDisplay } from "./components/PitchDisplay";
import "./App.css";

function App() {
  return (
    <div className="app">
      <header>
        <h1>VoxTrainer</h1>
        <p className="subtitle">Learn to sing from zero</p>
      </header>
      <main>
        <PitchDisplay />
      </main>
    </div>
  );
}

export default App;
