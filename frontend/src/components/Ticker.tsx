import { useStore } from '../store';

const SYMBOLS = ['ES', 'NQ', 'CL'];

export default function Ticker() {
  const ticks = useStore((s) => s.ticks);
  const activeSymbol = useStore((s) => s.activeSymbol);
  const setActiveSymbol = useStore((s) => s.setActiveSymbol);
  const connected = useStore((s) => s.connected);
  const demoMode = useStore((s) => s.demoMode);

  return (
    <div className="flex items-center h-10 px-3 bg-bg-card border-b border-border text-xs gap-1">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-6 h-6 bg-accent rounded flex items-center justify-center text-[10px] font-black text-white">Q</div>
        <span className="font-bold text-sm text-text-primary tracking-tight">QuadScalp</span>
      </div>

      {/* Symbol tickers */}
      {SYMBOLS.map((sym) => {
        const tick = ticks[sym];
        const isActive = sym === activeSymbol;
        const isUp = tick?.change ? tick.change >= 0 : true;
        return (
          <button
            key={sym}
            onClick={() => setActiveSymbol(sym)}
            className={`flex items-center gap-2 px-3 py-1 rounded transition-colors cursor-pointer
              ${isActive ? 'bg-bg-hover border border-accent/30' : 'hover:bg-bg-hover border border-transparent'}`}
          >
            <span className={`font-bold ${isActive ? 'text-accent' : 'text-text-primary'}`}>{sym}</span>
            {tick ? (
              <>
                <span className={`font-mono font-semibold ${isUp ? 'text-green' : 'text-red'}`}>
                  {tick.price.toFixed(2)}
                </span>
                <span className={`font-mono text-[10px] ${isUp ? 'text-green' : 'text-red'}`}>
                  {isUp ? '+' : ''}{tick.change?.toFixed(2) || '0.00'}
                </span>
              </>
            ) : (
              <span className="text-text-muted">---</span>
            )}
          </button>
        );
      })}

      {/* Status */}
      <div className="ml-auto flex items-center gap-3">
        {demoMode && (
          <span className="px-2 py-0.5 bg-yellow/10 text-yellow rounded text-[10px] font-bold">DEMO</span>
        )}
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green animate-pulse' : 'bg-red'}`} />
          <span className={`text-[10px] ${connected ? 'text-green' : 'text-red'}`}>
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>
    </div>
  );
}
