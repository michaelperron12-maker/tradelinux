import { useEffect } from 'react';
import { useStore } from '../store';

export default function TradeHistory() {
  const trades = useStore((s) => s.trades);
  const setTrades = useStore((s) => s.setTrades);

  useEffect(() => {
    fetch('/api/trades').then((r) => r.json()).then(setTrades).catch(() => {});
  }, []);

  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const wins = trades.filter((t) => t.pnl > 0).length;
  const winRate = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(1) : '0.0';

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-border text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center justify-between">
        <span>Trades</span>
        <div className="flex gap-3 font-normal">
          <span className="text-text-muted">{trades.length} trades</span>
          <span className="text-text-muted">WR: {winRate}%</span>
          <span className={`font-bold ${totalPnl >= 0 ? 'text-green' : 'text-red'}`}>
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
          </span>
        </div>
      </div>
      {trades.length === 0 ? (
        <div className="flex items-center justify-center h-full text-text-muted text-xs">
          No trades yet
        </div>
      ) : (
        <div className="overflow-auto text-xs">
          <table className="w-full">
            <thead>
              <tr className="text-text-muted border-b border-border">
                <th className="px-2 py-1 text-left font-medium">Sym</th>
                <th className="px-2 py-1 text-left font-medium">Side</th>
                <th className="px-2 py-1 text-right font-medium">Entry</th>
                <th className="px-2 py-1 text-right font-medium">Exit</th>
                <th className="px-2 py-1 text-right font-medium">P&L</th>
                <th className="px-2 py-1 text-left font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-b border-border/50 hover:bg-bg-hover">
                  <td className="px-2 py-1.5 font-bold text-accent">{t.symbol}</td>
                  <td className="px-2 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold
                      ${t.side === 'LONG' ? 'bg-green/20 text-green' : 'bg-red/20 text-red'}`}>
                      {t.side}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{t.entry_price.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{t.exit_price.toFixed(2)}</td>
                  <td className={`px-2 py-1.5 text-right font-mono font-bold
                    ${t.pnl >= 0 ? 'text-green' : 'text-red'}`}>
                    {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-bg-hover text-text-muted text-[10px]">
                      {t.exit_type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
