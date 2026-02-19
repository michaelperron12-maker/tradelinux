import { useEffect, useState } from 'react';
import { useStore } from './store';
import PriceChart from './components/PriceChart';

function App() {
  const { ticks, updateTick, balance, dailyPnl, updateAccount, positions, setPositions, trades, setTrades } = useStore();
  const [connected, setConnected] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState('ES');
  const [dom, setDom] = useState<{ bids: number[][]; asks: number[][] }>({ bids: [], asks: [] });

  // Order entry state
  const [orderType, setOrderType] = useState<'MKT' | 'LMT' | 'STP'>('MKT');
  const [qty, setQty] = useState(1);
  const [limitPrice, setLimitPrice] = useState('');

  // Poll API every 2 seconds
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

        // DOM for active symbol
        const activeMkt = activeSymbol === 'ES' ? mktES : activeSymbol === 'NQ' ? mktNQ : mktCL;
        if (activeMkt.dom) {
          setDom({ bids: activeMkt.dom.bids || [], asks: activeMkt.dom.asks || [] });
        }
        setConnected(true);
      } catch {
        setConnected(false);
      }
    }
    poll();
    const id = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [activeSymbol]);

  const symbols = ['ES', 'NQ', 'CL'];

  async function placeOrder(side: 'BUY' | 'SELL') {
    const body: Record<string, unknown> = { symbol: activeSymbol, side, qty, order_type: orderType };
    if (orderType !== 'MKT' && limitPrice) body.price = parseFloat(limitPrice);
    await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  async function flatten() {
    await fetch('/api/orders/flatten', { method: 'POST' });
  }

  // Stats
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const wins = trades.filter(t => t.pnl > 0).length;
  const losses = trades.filter(t => t.pnl < 0).length;
  const winRate = trades.length > 0 ? (wins / trades.length * 100).toFixed(1) : '0';
  const grossProfit = trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : '0';
  const avgWin = wins > 0 ? (grossProfit / wins).toFixed(2) : '0';
  const avgLoss = losses > 0 ? (grossLoss / losses).toFixed(2) : '0';

  // DOM
  const maxDomSize = Math.max(...dom.bids.map(b => b[1] || 0), ...dom.asks.map(a => a[1] || 0), 1);

  const B = '#1e293b'; // border color
  const C = '#111827'; // card bg

  return (
    <div style={{ background: '#0a0e17', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ═══ TICKER BAR ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', height: 44, padding: '0 16px', background: C, borderBottom: `1px solid ${B}`, gap: 4, fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 20 }}>
          <div style={{ width: 28, height: 28, background: '#3b82f6', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12, color: '#fff' }}>Q</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em' }}>QuadScalp</span>
        </div>
        {symbols.map(sym => {
          const tick = ticks[sym];
          const active = sym === activeSymbol;
          const up = tick?.change ? tick.change >= 0 : true;
          return (
            <button key={sym} onClick={() => setActiveSymbol(sym)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderRadius: 6, border: active ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent', background: active ? '#1a2332' : 'transparent', cursor: 'pointer', color: 'inherit', fontSize: 13 }}>
              <span style={{ fontWeight: 700, color: active ? '#3b82f6' : '#e2e8f0' }}>{sym}</span>
              {tick ? (<>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: up ? '#22c55e' : '#ef4444' }}>{tick.price.toFixed(2)}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: up ? '#22c55e' : '#ef4444' }}>{up ? '+' : ''}{tick.change?.toFixed(2) || '0.00'}</span>
              </>) : <span style={{ color: '#64748b' }}>---</span>}
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

      {/* ═══ MAIN ═══ */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ═══ CENTER ═══ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Chart header + KPIs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px', borderBottom: `1px solid ${B}`, fontSize: 12 }}>
            <span style={{ fontWeight: 700, color: '#3b82f6', fontSize: 14 }}>{activeSymbol}</span>
            <span style={{ color: '#64748b' }}>5s</span>
            {ticks[activeSymbol] && (
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: ticks[activeSymbol]?.change && ticks[activeSymbol].change! >= 0 ? '#22c55e' : '#ef4444' }}>
                {ticks[activeSymbol].price.toFixed(2)}
              </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
              <KPI label="Balance" value={`$${balance.toLocaleString('en', { minimumFractionDigits: 2 })}`} />
              <KPI label="P&L" value={`${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)}`} color={dailyPnl >= 0 ? '#22c55e' : '#ef4444'} />
              <KPI label="Net" value={`${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`} color={totalPnl >= 0 ? '#22c55e' : '#ef4444'} />
              <KPI label="WR" value={`${winRate}%`} color={Number(winRate) >= 50 ? '#22c55e' : '#ef4444'} />
              <KPI label="PF" value={profitFactor} color={Number(profitFactor) >= 1 ? '#22c55e' : '#ef4444'} />
              <KPI label="Trades" value={`${trades.length}`} />
              <KPI label="Avg W" value={`$${avgWin}`} color="#22c55e" />
              <KPI label="Avg L" value={`$${avgLoss}`} color="#ef4444" />
            </div>
          </div>

          {/* Chart */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <PriceChart symbol={activeSymbol} price={ticks[activeSymbol]?.price} />
          </div>

          {/* POSITIONS + TRADES */}
          <div style={{ height: 200, display: 'flex', borderTop: `1px solid ${B}` }}>
            {/* Positions */}
            <div style={{ flex: 1, borderRight: `1px solid ${B}`, overflow: 'auto', fontSize: 12 }}>
              <div style={{ padding: '6px 12px', borderBottom: `1px solid ${B}`, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
                <span>Positions</span><span style={{ color: '#64748b' }}>{positions.length}</span>
              </div>
              {positions.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>No open positions</div>
              ) : positions.map((p, i) => (
                <div key={i} style={{ display: 'flex', padding: '6px 12px', borderBottom: '1px solid rgba(30,41,59,0.5)', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#3b82f6' }}>{p.symbol}</span>
                  <Badge text={p.side} green={p.side === 'LONG'} />
                  <span style={{ fontFamily: 'monospace' }}>{p.qty}x</span>
                  <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>@ {p.avg_price.toFixed(2)}</span>
                  <span style={{ fontFamily: 'monospace', color: '#64748b' }}>&rarr; {p.current_price?.toFixed(2) || '---'}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 700, color: (p.unrealized_pnl || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                    {(p.unrealized_pnl || 0) >= 0 ? '+' : ''}${(p.unrealized_pnl || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Trades */}
            <div style={{ flex: 1, overflow: 'auto', fontSize: 12 }}>
              <div style={{ padding: '6px 12px', borderBottom: `1px solid ${B}`, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
                <span>Trades</span>
                <span style={{ fontWeight: 700, color: totalPnl >= 0 ? '#22c55e' : '#ef4444' }}>{totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}</span>
              </div>
              {trades.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>No trades yet</div>
              ) : trades.map((t) => (
                <div key={t.id} style={{ display: 'flex', padding: '6px 12px', borderBottom: '1px solid rgba(30,41,59,0.5)', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#3b82f6' }}>{t.symbol}</span>
                  <Badge text={t.side} green={t.side === 'LONG'} />
                  <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{t.entry_price.toFixed(2)}</span>
                  <span style={{ color: '#64748b' }}>&rarr;</span>
                  <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{t.exit_price.toFixed(2)}</span>
                  <Badge text={t.exit_type} />
                  <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontWeight: 700, color: t.pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                    {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ RIGHT SIDEBAR ═══ */}
        <div style={{ width: 290, display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${B}`, background: C }}>

          {/* ORDER ENTRY */}
          <div style={{ padding: 14, borderBottom: `1px solid ${B}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Order Entry</div>

            {/* Symbol + Price */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, color: '#3b82f6', fontSize: 16 }}>{activeSymbol}</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: ticks[activeSymbol]?.change && ticks[activeSymbol].change! >= 0 ? '#22c55e' : '#ef4444' }}>
                {ticks[activeSymbol]?.price.toFixed(2) || '---'}
              </span>
            </div>

            {/* Order Type */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {(['MKT', 'LMT', 'STP'] as const).map(t => (
                <button key={t} onClick={() => setOrderType(t)}
                  style={{ flex: 1, padding: '6px 0', borderRadius: 4, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                    background: t === orderType ? '#3b82f6' : '#1a2332', color: t === orderType ? '#fff' : '#94a3b8' }}>
                  {t}
                </button>
              ))}
            </div>

            {/* Price (LMT/STP) */}
            {orderType !== 'MKT' && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Price</div>
                <input type="number" step="0.25" value={limitPrice} onChange={e => setLimitPrice(e.target.value)}
                  placeholder={ticks[activeSymbol]?.price.toFixed(2)}
                  style={{ width: '100%', background: '#0a0e17', border: `1px solid ${B}`, borderRadius: 4, padding: '6px 8px', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 13, outline: 'none' }} />
              </div>
            )}

            {/* Qty */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Qty</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setQty(Math.max(1, qty - 1))}
                  style={{ width: 32, height: 32, background: '#1a2332', border: 'none', borderRadius: 4, color: '#94a3b8', fontSize: 16, cursor: 'pointer' }}>-</button>
                <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ flex: 1, background: '#0a0e17', border: `1px solid ${B}`, borderRadius: 4, padding: '4px 8px', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, textAlign: 'center', outline: 'none' }} />
                <button onClick={() => setQty(qty + 1)}
                  style={{ width: 32, height: 32, background: '#1a2332', border: 'none', borderRadius: 4, color: '#94a3b8', fontSize: 16, cursor: 'pointer' }}>+</button>
              </div>
            </div>

            {/* BUY / SELL */}
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
              style={{ width: '100%', padding: '8px 0', background: 'rgba(249,115,22,0.15)', color: '#f97316', fontWeight: 700, fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer' }}>
              FLATTEN ALL
            </button>
          </div>

          {/* ACCOUNT */}
          <div style={{ padding: 14, borderBottom: `1px solid ${B}`, fontSize: 13 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Account</div>
            <Row label="Balance" value={`$${balance.toLocaleString('en', { minimumFractionDigits: 2 })}`} />
            <Row label="Equity" value={`$${(useStore.getState().equity || balance).toLocaleString('en', { minimumFractionDigits: 2 })}`} />
            <Row label="Daily P&L" value={`${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)}`} color={dailyPnl >= 0 ? '#22c55e' : '#ef4444'} />
            <Row label="Unrealized" value={`${(useStore.getState().unrealizedPnl || 0) >= 0 ? '+' : ''}$${(useStore.getState().unrealizedPnl || 0).toFixed(2)}`} color={(useStore.getState().unrealizedPnl || 0) >= 0 ? '#22c55e' : '#ef4444'} />
            <Row label="Margin" value={`$${(useStore.getState().marginUsed || 0).toLocaleString('en', { minimumFractionDigits: 2 })}`} />
            <Row label="Positions" value={`${positions.length}`} />
          </div>

          {/* DOM */}
          <div style={{ flex: 1, overflow: 'auto', fontSize: 11, fontFamily: 'monospace' }}>
            <div style={{ padding: '6px 10px', borderBottom: `1px solid ${B}`, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em', fontFamily: 'Inter, sans-serif', display: 'flex', justifyContent: 'space-between' }}>
              <span>DOM &mdash; {activeSymbol}</span>
              {ticks[activeSymbol] && <span style={{ color: ticks[activeSymbol]?.change && ticks[activeSymbol].change! >= 0 ? '#22c55e' : '#ef4444' }}>{ticks[activeSymbol].price.toFixed(2)}</span>}
            </div>
            {/* Column headers */}
            <div style={{ display: 'flex', padding: '3px 8px', color: '#64748b', borderBottom: `1px solid ${B}`, fontSize: 10 }}>
              <span style={{ flex: 1 }}>Bid</span>
              <span style={{ width: 70, textAlign: 'center' }}>Price</span>
              <span style={{ flex: 1, textAlign: 'right' }}>Ask</span>
            </div>
            {/* Asks (reversed) */}
            {[...dom.asks].reverse().map((a, i) => (
              <div key={`a${i}`} style={{ display: 'flex', padding: '1px 8px', position: 'relative' }}>
                <span style={{ flex: 1 }}></span>
                <span style={{ width: 70, textAlign: 'center', color: '#ef4444' }}>{a[0]?.toFixed(2)}</span>
                <span style={{ flex: 1, textAlign: 'right', color: 'rgba(239,68,68,0.7)' }}>{a[1]}</span>
                <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', background: 'rgba(239,68,68,0.08)', width: `${(a[1] / maxDomSize) * 50}%` }} />
              </div>
            ))}
            {/* Spread */}
            {dom.asks.length > 0 && dom.bids.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3px 8px', background: '#1a2332', borderTop: `1px solid ${B}`, borderBottom: `1px solid ${B}`, fontSize: 10, color: '#64748b' }}>
                Spread: {(dom.asks[0][0] - dom.bids[0][0]).toFixed(2)}
              </div>
            )}
            {/* Bids */}
            {dom.bids.map((b, i) => (
              <div key={`b${i}`} style={{ display: 'flex', padding: '1px 8px', position: 'relative' }}>
                <span style={{ flex: 1, color: 'rgba(34,197,94,0.7)' }}>{b[1]}</span>
                <span style={{ width: 70, textAlign: 'center', color: '#22c55e' }}>{b[0]?.toFixed(2)}</span>
                <span style={{ flex: 1 }}></span>
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: 'rgba(34,197,94,0.08)', width: `${(b[1] / maxDomSize) * 50}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color: '#64748b', fontSize: 10, marginBottom: 1 }}>{label}</div>
      <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: color || '#e2e8f0' }}>{value}</div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: color || '#e2e8f0' }}>{value}</span>
    </div>
  );
}

function Badge({ text, green }: { text: string; green?: boolean }) {
  const isGreen = green === true;
  const isRed = green === false;
  const bg = isGreen ? 'rgba(34,197,94,0.2)' : isRed ? 'rgba(239,68,68,0.2)' : 'rgba(30,41,59,0.8)';
  const fg = isGreen ? '#22c55e' : isRed ? '#ef4444' : '#64748b';
  return <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: bg, color: fg }}>{text}</span>;
}

export default App;
