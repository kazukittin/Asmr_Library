import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { PlayerBar } from './components/PlayerBar';
import { WorkGrid } from './components/WorkGrid';
import { Search } from 'lucide-react';

function BrowserWarning() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-900 text-white p-10 text-center flex-col">
      <h1 className="text-3xl font-bold mb-4 text-red-500">Tauri Environment Required</h1>
      <p className="max-w-md text-gray-300 mb-8">
        This application relies on Tauri's backend capabilities (File System, Database, Audio) and cannot run in a standard web browser.
      </p>
      <div className="bg-gray-800 p-4 rounded-lg font-mono text-sm text-left">
        <p className="text-gray-400 mb-2">Please run the following command in your terminal:</p>
        <code className="text-accent select-all">npm run tauri dev</code>
      </div>
    </div>
  );
}

function App() {
  const [searchQuery, setSearchQuery] = useState("");
  // Immediately check for Tauri environment to avoid rendering backend calls in browser
  const [isTauri, setIsTauri] = useState(() => {
    return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
  });

  useEffect(() => {
    // Double check in effect in case of hydration issues or late injection (though rare)
    if (!('__TAURI_INTERNALS__' in window) && !('__TAURI__' in window)) {
      setIsTauri(false);
    }
  }, []);

  if (!isTauri) {
    return <BrowserWarning />;
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-bg-main text-gray-300 overflow-hidden font-sans selection:bg-accent selection:text-white">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 flex flex-col relative overflow-hidden bg-gradient-to-b from-bg-sidebar to-bg-main">
          <header className="h-16 glass z-10 flex items-center justify-between px-8 sticky top-0 border-b border-white/5 shrink-0">
            <div className="w-96 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="検索 (タイトル, CV, RJ番号)..."
                className="w-full bg-white/5 border border-white/10 rounded-full py-1.5 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent focus:bg-white/10 transition-colors"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center space-x-4">
              {/* Extra header items if needed */}
            </div>
          </header>

          <WorkGrid />
        </main>
      </div>

      <PlayerBar />

    </div>
  );
}

export default App;
