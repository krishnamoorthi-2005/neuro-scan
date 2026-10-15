import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { NeuroScanProvider } from './context/NeuroScanContext';
import Header from './components/Header';
import Landing from './pages/Landing';
import Diagnosis from './pages/Diagnosis';
import Archive from './pages/Archive';

function App() {
  return (
    <NeuroScanProvider>
      <Router>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1 overflow-auto">
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/diagnosis" element={<Diagnosis />} />
              <Route path="/archive" element={<Archive />} />
            </Routes>
          </main>
        </div>
      </Router>
    </NeuroScanProvider>
  );
}

export default App;
