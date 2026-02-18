import { useStore } from '../store';

export default function Positions() {
  const positions = useStore((s) => s.positions);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-border text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center justify-between">
        <span>Positions</span>
        <span className="text-text-muted font-normal">{positions.length}</span>
      </div>
      {positions.length === 0 ? (
        <div className="flex items-center justify-center h-full text-text-muted text-xs">
          No open positions
        </div>
      ) : (
        <div className="overflow-auto text-xs">
          <table className="w-full">
            <thead>
              <tr className="text-text-muted border-b border-border">
                <th className="px-2 py-1 text-left font-medium">Sym</th>
                <th className="px-2 py-1 text-left font-medium">Side</th>
                <th className="px-2 py-1 text-right font-medium">Qty</th>
                <th className="px-2 py-1 text-right font-medium">Avg</th>
                <th className="px-2 py-1 text-right font-medium">P&L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-bg-hover">
                  <td className="px-2 py-1.5 font-bold text-accent">{p.symbol}</td>
                  <td className="px-2 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold
                      ${p.side === 'LONG' ? 'bg-green/20 text-green' : 'bg-red/20 text-red'}`}>
                      {p.side}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{p.qty}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{p.avg_price.toFixed(2)}</td>
                  <td className={`px-2 py-1.5 text-right font-mono font-bold
                    ${(p.unrealized_pnl || 0) >= 0 ? 'text-green' : 'text-red'}`}>
                    {(p.unrealized_pnl || 0) >= 0 ? '+' : ''}${(p.unrealized_pnl || 0).toFixed(2)}
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
