import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number>(0);
  const store = useStore;

  useEffect(() => {
    function connect() {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = window.location.port || '5173';
        const url = `${protocol}//${host}:${port}/ws`;

        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          store.getState().setConnected(true);
          console.log('[WS] Connected');
        };

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            const s = store.getState();
            switch (msg.type) {
              case 'init':
                s.setDemoMode(msg.demo_mode);
                if (msg.account) {
                  s.updateAccount({
                    balance: msg.account.balance,
                    dailyPnl: msg.account.daily_pnl,
                  });
                }
                break;
              case 'tick':
                s.updateTick({ symbol: msg.symbol, price: msg.price, size: msg.size, time: msg.time });
                break;
              case 'bar':
                s.addBar({ symbol: msg.symbol, tf: msg.tf, o: msg.o, h: msg.h, l: msg.l, c: msg.c, v: msg.v, t: msg.t });
                break;
              case 'dom':
                s.updateDOM(msg.symbol, msg.bids, msg.asks);
                break;
              case 'fill':
                fetch('/api/positions').then(r => r.json()).then(s.setPositions).catch(() => {});
                fetch('/api/trades').then(r => r.json()).then(s.setTrades).catch(() => {});
                break;
              case 'position':
                s.updatePosition({
                  symbol: msg.symbol, side: msg.side, qty: msg.qty,
                  avg_price: msg.avg_price, entry_time: '',
                  unrealized_pnl: msg.unrealized_pnl,
                });
                break;
              case 'account':
                s.updateAccount({ balance: msg.balance, dailyPnl: msg.daily_pnl });
                break;
            }
          } catch (err) {
            console.warn('[WS] Message parse error:', err);
          }
        };

        ws.onclose = () => {
          store.getState().setConnected(false);
          console.log('[WS] Disconnected, reconnecting in 3s...');
          reconnectTimer.current = window.setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        console.warn('[WS] Connection error:', err);
        reconnectTimer.current = window.setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  return wsRef;
}
