import { useStore } from '../store';

export default function DOM() {
  const activeSymbol = useStore((s) => s.activeSymbol);
  const domData = useStore((s) => s.dom[s.activeSymbol]);
  const lastTick = useStore((s) => s.ticks[s.activeSymbol]);

  if (!domData) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-1.5 border-b border-border text-xs font-bold text-text-secondary uppercase tracking-wider">
          DOM
        </div>
        <div className="flex items-center justify-center h-full text-text-muted text-xs">
          Waiting for data...
        </div>
      </div>
    );
  }

  const maxSize = Math.max(
    ...domData.bids.map((b) => b.size),
    ...domData.asks.map((a) => a.size),
    1
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-border text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center justify-between">
        <span>DOM — {activeSymbol}</span>
        {lastTick && (
          <span className={`font-mono font-bold ${(lastTick.change || 0) >= 0 ? 'text-green' : 'text-red'}`}>
            {lastTick.price.toFixed(2)}
          </span>
        )}
      </div>
      <div className="overflow-auto flex-1 text-[11px] font-mono">
        {/* Header */}
        <div className="flex px-2 py-1 text-text-muted border-b border-border sticky top-0 bg-bg-card">
          <span className="flex-1 text-left">Bid Size</span>
          <span className="w-20 text-center">Price</span>
          <span className="flex-1 text-right">Ask Size</span>
        </div>
        {/* Asks (reversed so lowest ask is at bottom) */}
        {[...domData.asks].reverse().map((a, i) => (
          <div key={`a-${i}`} className="flex px-2 py-0.5 relative hover:bg-bg-hover">
            <span className="flex-1" />
            <span className="w-20 text-center text-red">{a.price.toFixed(2)}</span>
            <span className="flex-1 text-right text-red/80">{a.size}</span>
            <div
              className="absolute right-0 top-0 h-full bg-red/10"
              style={{ width: `${(a.size / maxSize) * 50}%` }}
            />
          </div>
        ))}
        {/* Spread */}
        {domData.asks.length > 0 && domData.bids.length > 0 && (
          <div className="flex px-2 py-1 bg-bg-hover/50 border-y border-border/50">
            <span className="flex-1 text-text-muted text-center text-[10px]">
              Spread: {(domData.asks[0].price - domData.bids[0].price).toFixed(2)}
            </span>
          </div>
        )}
        {/* Bids */}
        {domData.bids.map((b, i) => (
          <div key={`b-${i}`} className="flex px-2 py-0.5 relative hover:bg-bg-hover">
            <span className="flex-1 text-left text-green/80">{b.size}</span>
            <span className="w-20 text-center text-green">{b.price.toFixed(2)}</span>
            <span className="flex-1" />
            <div
              className="absolute left-0 top-0 h-full bg-green/10"
              style={{ width: `${(b.size / maxSize) * 50}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
