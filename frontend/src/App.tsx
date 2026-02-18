import { useEffect, useState } from 'react';
import { useStore } from './store';
import PriceChart from './components/PriceChart';

// Simple app without WebSocket first - just REST polling
function App() {
  const { ticks, updateTick, balance, dailyPnl, updateAccount, positions, setPositions, trades, setTrades } = useStore();
  const [connected, setConnected] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState('ES');

  // Poll API every 2 seconds instead of WebSocket
  useEffect(() => {
    let alive = true;

    async function poll() {
      try {
        const [mktES, mktNQ, mktCL, acc, pos, trd] = await Promise.all([
          fetch('/api/market/ES').then(r => r.json()),
          fetch('/api/market/NQ').then(r => r.json()),
          fetch('/api/market/CL').then(r => r.json()),
          fetch('/api/account').then(r => r.json()),
          fetch('/api/positions').then(r => r.json()),
          fetch('/api/trades').then(r => r.json()),
        ]);
        if (!alive) return;

        updateTick({ symbol: 'ES', price: mktES.price, size: 0, time: Date.now() / 1000 });
        updateTick({ symbol: 'NQ', price: mktNQ.price, size: 0, time: Date.now() / 1000 });
        updateTick({ symbol: 'CL', price: mktCL.price, size: 0, time: Date.now() / 1000 });
        updateAccount({ balance: acc.balance, equity: acc.equity, dailyPnl: acc.daily_pnl, unrealizedPnl: acc.unrealized_pnl, marginUsed: acc.margin_used });
        setPositions(pos);
        setTrades(trd);
        setConnected(true);
      } catch {
        setConnected(false);
      }
    }

    poll();
    const id = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const symbols = ['ES', 'NQ', 'CL'];

  async function placeOrder(side: 'BUY' | 'SELL') {
    await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: activeSymbol, side, qty: 1, order_type: 'MKT' }),
    });
  }

  async function flatten() {
    await fetch('/api/orders/flatten', { method: 'POST' });
  }

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const wins = trades.filter(t => t.pnl > 0).length;
  const winRate = trades.length > 0 ? (wins / trades.length * 100).toFixed(1) : '0';

  return (
    <div style={{ background: '#0a0e17', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* TICKER BAR */}
      <div style={{ display: 'flex', alignItems: 'center', height: 44, padding: '0 16px', background: '#111827', borderBottom: '1px solid #1e293b', gap: 4, fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 20 }}>
          <div style={{ width: 28, height: 28, background: '#3b82f6', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12, color: '#fff' }}>Q</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em' }}>QuadScalp</span>
        </div>

        {symbols.map(sym => {
          const tick = ticks[sym];
          const isActive = sym === activeSymbol;
          const isUp = tick?.change ? tick.change >= 0 : true;
          return (
            <button key={sym} onClick={() => setActiveSymbol(sym)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderRadius: 6, border: isActive ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent', background: isActive ? '#1a2332' : 'transparent', cursor: 'pointer', color: 'inherit', fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: isActive ? '#3b82f6' : '#e2e8f0' }}>{sym}</span>
              {tick ? (
                <>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, color: isUp ? '#22c55e' : '#ef4444' }}>{tick.price.toFixed(2)}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: isUp ? '#22c55e' : '#ef4444' }}>{isUp ? '+' : ''}{tick.change?.toFixed(2) || '0.00'}</span>
                </>
              ) : <span style={{ color: '#64748b' }}>---</span>}
            </button>
          );
        })}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ padding: '2px 8px', background: 'rgba(234,179,8,0.1)', color: '#eab308', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>DEMO</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? '#22c55e' : '#ef4444' }} />
            <span style={{ fontSize: 10, color: connected ? '#22c55e' : '#ef4444' }}>{connected ? 'LIVE' : 'OFFLINE'}</span>
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* CENTER */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* CHART + KPI */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #1e293b' }}>
            {/* Chart header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px', borderBottom: '1px solid #1e293b', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: '#3b82f6' }}>{activeSymbol}</span>
              <span style={{ color: '#64748b' }}>5s</span>
              {ticks[activeSymbol] && (
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: ticks[activeSymbol]?.change && ticks[activeSymbol].change! >= 0 ? '#22c55e' : '#ef4444' }}>
                  {ticks[activeSymbol].price.toFixed(2)}
                </span>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
                <KPI label="Balance" value={`$${balance.toLocaleString('en', { minimumFractionDigits: 2 })}`} />
                <KPI label="P&L" value={`${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)}`} color={dailyPnl >= 0 ? '#22c55e' : '#ef4444'} />
                <KPI label="Trades" value={`${trades.length}`} />
                <KPI label="WR" value={`${winRate}%`} color={Number(winRate) >= 50 ? '#22c55e' : '#ef4444'} />
              </div>
            </div>
            {/* Chart */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <PriceChart symbol={activeSymbol} price={ticks[activeSymbol]?.price} />
            </div>
          </div>

          {/* POSITIONS + TRADES */}
          <div style={{ height: 200, display: 'flex', borderTop: '1px solid #1e293b' }}>
            {/* Positions */}
            <div style={{ flex: 1, borderRight: '1px solid #1e293b', overflow: 'auto', fontSize: 12 }}>
              <div style={{ padding: '6px 12px', borderBottom: '1px solid #1e293b', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.05em' }}>
                Positions ({positions.length})
              </div>
              {positions.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>No open positions</div>
              ) : positions.map((p, i) => (
                <div key={i} style={{ display: 'flex', padding: '6px 12px', borderBottom: '1px solid rgba(30,41,59,0.5)', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#3b82f6' }}>{p.symbol}</span>
                  <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: p.side === 'LONG' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)', color: p.side === 'LONG' ? '#22c55e' : '#ef4444' }}>{p.side}</span>
                  <span style={{ fontFamily: 'monospace' }}>{p.qty}</span>
                  <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>@ {p.avg_price.toFixed(2)}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 700, color: (p.unrealized_pnl || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                    {(p.unrealized_pnl || 0) >= 0 ? '+' : ''}${(p.unrealized_pnl || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            {/* Trades */}
            <div style={{ flex: 1, overflow: 'auto', fontSize: 12 }}>
              <div style={{ padding: '6px 12px', borderBottom: '1px solid #1e293b', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.05em' }}>
                Trades ({trades.length})
              </div>
              {trades.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>No trades yet</div>
              ) : trades.map((t) => (
                <div key={t.id} style={{ display: 'flex', padding: '6px 12px', borderBottom: '1px solid rgba(30,41,59,0.5)', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#3b82f6' }}>{t.symbol}</span>
                  <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: t.side === 'LONG' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)', color: t.side === 'LONG' ? '#22c55e' : '#ef4444' }}>{t.side}</span>
                  <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{t.entry_price.toFixed(2)} → {t.exit_price.toFixed(2)}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 700, color: t.pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                    {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #1e293b', background: '#111827' }}>
          {/* Order Entry */}
          <div style={{ padding: 16, borderBottom: '1px solid #1e293b' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Order Entry</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontWeight: 700, color: '#3b82f6', fontSize: 16 }}>{activeSymbol}</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: ticks[activeSymbol]?.change && ticks[activeSymbol].change! >= 0 ? '#22c55e' : '#ef4444' }}>
                {ticks[activeSymbol]?.price.toFixed(2) || '---'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button onClick={() => placeOrder('BUY')}
                style={{ flex: 1, padding: '14px 0', background: '#22c55e', color: '#fff', fontWeight: 700, fontSize: 15, borderRadius: 6, border: 'none', cursor: 'pointer' }}>
                BUY
              </button>
              <button onClick={() => placeOrder('SELL')}
                style={{ flex: 1, padding: '14px 0', background: '#ef4444', color: '#fff', fontWeight: 700, fontSize: 15, borderRadius: 6, border: 'none', cursor: 'pointer' }}>
                SELL
              </button>
            </div>
            <button onClick={flatten}
              style={{ width: '100%', padding: '10px 0', background: 'rgba(249,115,22,0.15)', color: '#f97316', fontWeight: 700, fontSize: 13, borderRadius: 6, border: 'none', cursor: 'pointer' }}>
              FLATTEN ALL
            </button>
          </div>

          {/* Account */}
          <div style={{ padding: 16, borderBottom: '1px solid #1e293b', fontSize: 13 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Account</div>
            <Row label="Balance" value={`$${balance.toLocaleString('en', { minimumFractionDigits: 2 })}`} />
            <Row label="Daily P&L" value={`${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)}`} color={dailyPnl >= 0 ? '#22c55e' : '#ef4444'} />
            <Row label="Positions" value={`${positions.length}`} />
            <Row label="Trades" value={`${trades.length}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'monospace', fontWeight: 700, color: color || '#e2e8f0' }}>{value}</div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: color || '#e2e8f0' }}>{value}</span>
    </div>
  );
}

export default App;
