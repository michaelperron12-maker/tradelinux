import { create } from 'zustand';

export interface TickData {
  symbol: string;
  price: number;
  size: number;
  time: number;
  change?: number;
  changePct?: number;
}

export interface BarData {
  symbol: string;
  tf: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  t: number;
}

export interface DOMLevel {
  price: number;
  size: number;
}

export interface Position {
  symbol: string;
  side: string;
  qty: number;
  avg_price: number;
  entry_time: string;
  current_price?: number;
  unrealized_pnl?: number;
}

export interface TradeRecord {
  id: number;
  symbol: string;
  side: string;
  qty: number;
  entry_price: number;
  exit_price: number;
  pnl: number;
  entry_time: string;
  exit_time: string;
  exit_type: string;
}

export interface OrderRecord {
  id: number;
  symbol: string;
  side: string;
  qty: number;
  order_type: string;
  price: number;
  status: string;
  created_at: string;
}

interface TradingStore {
  // Connection
  connected: boolean;
  demoMode: boolean;
  setConnected: (v: boolean) => void;
  setDemoMode: (v: boolean) => void;

  // Market data
  ticks: Record<string, TickData>;
  bars: Record<string, BarData[]>;
  dom: Record<string, { bids: DOMLevel[]; asks: DOMLevel[] }>;
  updateTick: (tick: TickData) => void;
  addBar: (bar: BarData) => void;
  updateDOM: (symbol: string, bids: [number, number][], asks: [number, number][]) => void;
  setBars: (symbol: string, bars: BarData[]) => void;

  // Account
  balance: number;
  equity: number;
  dailyPnl: number;
  unrealizedPnl: number;
  marginUsed: number;
  updateAccount: (data: Partial<{ balance: number; equity: number; dailyPnl: number; unrealizedPnl: number; marginUsed: number }>) => void;

  // Positions
  positions: Position[];
  setPositions: (p: Position[]) => void;
  updatePosition: (p: Position) => void;

  // Orders
  orders: OrderRecord[];
  setOrders: (o: OrderRecord[]) => void;
  addOrder: (o: OrderRecord) => void;

  // Trades
  trades: TradeRecord[];
  setTrades: (t: TradeRecord[]) => void;
  addTrade: (t: TradeRecord) => void;

  // UI
  activeSymbol: string;
  setActiveSymbol: (s: string) => void;
}

export const useStore = create<TradingStore>((set, get) => ({
  // Connection
  connected: false,
  demoMode: true,
  setConnected: (v) => set({ connected: v }),
  setDemoMode: (v) => set({ demoMode: v }),

  // Market data
  ticks: {},
  bars: {},
  dom: {},
  updateTick: (tick) => set((s) => {
    const prev = s.ticks[tick.symbol];
    const change = prev ? tick.price - prev.price : 0;
    return {
      ticks: { ...s.ticks, [tick.symbol]: { ...tick, change, changePct: prev ? (change / prev.price) * 100 : 0 } },
    };
  }),
  addBar: (bar) => set((s) => {
    const existing = s.bars[bar.symbol] || [];
    const updated = [...existing, bar];
    if (updated.length > 2000) updated.splice(0, updated.length - 2000);
    return { bars: { ...s.bars, [bar.symbol]: updated } };
  }),
  updateDOM: (symbol, bids, asks) => set((s) => ({
    dom: {
      ...s.dom,
      [symbol]: {
        bids: bids.map(([price, size]) => ({ price, size })),
        asks: asks.map(([price, size]) => ({ price, size })),
      },
    },
  })),
  setBars: (symbol, bars) => set((s) => ({ bars: { ...s.bars, [symbol]: bars } })),

  // Account
  balance: 50000,
  equity: 50000,
  dailyPnl: 0,
  unrealizedPnl: 0,
  marginUsed: 0,
  updateAccount: (data) => set((s) => ({ ...s, ...data })),

  // Positions
  positions: [],
  setPositions: (p) => set({ positions: p }),
  updatePosition: (p) => set((s) => {
    const idx = s.positions.findIndex((x) => x.symbol === p.symbol);
    if (idx >= 0) {
      const updated = [...s.positions];
      updated[idx] = p;
      return { positions: updated };
    }
    return { positions: [...s.positions, p] };
  }),

  // Orders
  orders: [],
  setOrders: (o) => set({ orders: o }),
  addOrder: (o) => set((s) => ({ orders: [o, ...s.orders] })),

  // Trades
  trades: [],
  setTrades: (t) => set({ trades: t }),
  addTrade: (t) => set((s) => ({ trades: [t, ...s.trades] })),

  // UI
  activeSymbol: 'ES',
  setActiveSymbol: (s) => set({ activeSymbol: s }),
}));
