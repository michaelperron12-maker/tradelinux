import { useState } from 'react';
import { useStore } from '../store';

export default function OrderEntry() {
  const activeSymbol = useStore((s) => s.activeSymbol);
  const lastTick = useStore((s) => s.ticks[s.activeSymbol]);
  const [qty, setQty] = useState(1);
  const [orderType, setOrderType] = useState<'MKT' | 'LMT' | 'STP'>('MKT');
  const [price, setPrice] = useState('');

  async function placeOrder(side: 'BUY' | 'SELL') {
    const body: Record<string, unknown> = {
      symbol: activeSymbol,
      side,
      qty,
      order_type: orderType,
    };
    if (orderType !== 'MKT' && price) {
      body.price = parseFloat(price);
    }
    await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function flattenAll() {
    await fetch('/api/orders/flatten', { method: 'POST' });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-border text-xs font-bold text-text-secondary uppercase tracking-wider">
        Order Entry
      </div>
      <div className="p-3 flex flex-col gap-3 text-xs">
        {/* Symbol + Price */}
        <div className="flex items-center justify-between">
          <span className="font-bold text-accent text-sm">{activeSymbol}</span>
          {lastTick && (
            <span className={`font-mono font-bold text-sm ${(lastTick.change || 0) >= 0 ? 'text-green' : 'text-red'}`}>
              {lastTick.price.toFixed(2)}
            </span>
          )}
        </div>

        {/* Order Type */}
        <div className="flex gap-1">
          {(['MKT', 'LMT', 'STP'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`flex-1 py-1.5 rounded font-bold transition-colors cursor-pointer
                ${t === orderType ? 'bg-accent text-white' : 'bg-bg-hover text-text-secondary hover:text-text-primary'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Price (for LMT/STP) */}
        {orderType !== 'MKT' && (
          <div>
            <label className="text-text-muted mb-1 block">Price</label>
            <input
              type="number"
              step="0.25"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={lastTick?.price.toFixed(2)}
              className="w-full bg-bg-primary border border-border rounded px-2 py-1.5 text-text-primary font-mono
                         focus:border-accent focus:outline-none"
            />
          </div>
        )}

        {/* Quantity */}
        <div>
          <label className="text-text-muted mb-1 block">Qty</label>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setQty(Math.max(1, qty - 1))}
              className="w-8 h-8 bg-bg-hover rounded flex items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer"
            >-</button>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="flex-1 bg-bg-primary border border-border rounded px-2 py-1.5 text-center text-text-primary font-mono font-bold
                         focus:border-accent focus:outline-none"
            />
            <button
              onClick={() => setQty(qty + 1)}
              className="w-8 h-8 bg-bg-hover rounded flex items-center justify-center text-text-secondary hover:text-text-primary cursor-pointer"
            >+</button>
          </div>
        </div>

        {/* Buy / Sell buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => placeOrder('BUY')}
            className="flex-1 py-3 bg-green hover:bg-green/80 text-white font-bold rounded transition-colors cursor-pointer text-sm"
          >
            BUY
          </button>
          <button
            onClick={() => placeOrder('SELL')}
            className="flex-1 py-3 bg-red hover:bg-red/80 text-white font-bold rounded transition-colors cursor-pointer text-sm"
          >
            SELL
          </button>
        </div>

        {/* Flatten */}
        <button
          onClick={flattenAll}
          className="w-full py-2 bg-orange/20 text-orange hover:bg-orange/30 font-bold rounded transition-colors cursor-pointer"
        >
          FLATTEN ALL
        </button>
      </div>
    </div>
  );
}
