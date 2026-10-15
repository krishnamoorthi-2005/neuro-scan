import { Link, useLocation } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function Header() {
  const location = useLocation();
  const [backendOnline, setBackendOnline] = useState(null);

  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/health`, { timeout: 2500 });
        if (mounted && res.data?.status === 'ONLINE') {
          setBackendOnline(true);
        } else if (mounted) {
          setBackendOnline(false);
        }
      } catch {
        if (mounted) setBackendOnline(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 8000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const getNavClass = (path) => {
    const isCurrent = location.pathname === path;
    return `flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
      isCurrent
        ? 'bg-[#00E599] text-[#071a16] shadow-md shadow-teal/30'
        : 'text-text hover:bg-surface1 hover:text-white'
    }`;
  };

  return (
    <header className="bg-mantle border-b border-surface0 p-3 md:px-6 sticky top-0 z-50 backdrop-blur-md">
      <div className="w-full flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="bg-teal/20 p-2 rounded-xl border border-teal/40">
            <Activity className="w-6 h-6 text-[#00E599]" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-text m-0 flex items-center gap-2">
              NeuroScan
              <span className="text-[#00E599] text-[10px] px-2 py-0.5 rounded-md bg-teal/15 border border-teal/30 font-mono">
                MED-AI V4.2
              </span>
            </h1>
            <p className="text-[11px] text-subtext0 m-0 font-mono">Clinical Gated Engine Active</p>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          <Link to="/" className={getNavClass('/')}>Home</Link>
          <Link to="/diagnosis" className={getNavClass('/diagnosis')}>Interactive Scanner</Link>
          <Link to="/archive" className={getNavClass('/archive')}>PACS Archive</Link>
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-surface0 rounded-xl text-xs font-mono border border-surface1">
            <span
              className={`w-2 h-2 rounded-full ${
                backendOnline === true
                  ? 'bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse'
                  : backendOnline === false
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-subtext0'
              }`}
            />
            <span className="text-text font-medium">
              {backendOnline === true
                ? 'AI Engine Online'
                : backendOnline === false
                ? 'AI Engine Starting...'
                : 'Connecting...'}
            </span>
          </div>
          <Link
            to="/diagnosis"
            className="bg-[#00E599] hover:bg-[#00F5A0] text-[#071a16] font-extrabold text-xs font-mono px-4 py-2 rounded-xl transition-all shadow-md shadow-teal/30 hover:scale-105 flex items-center gap-1.5"
          >
            Launch Scan
          </Link>
        </div>
      </div>
    </header>
  );
}
