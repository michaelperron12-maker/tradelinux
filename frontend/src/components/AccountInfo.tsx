import { useEffect, useState } from 'react';
import { useStore } from '../store';

export default function AccountInfo() {
  const { balance, dailyPnl, positions } = useStore();
  const ticks = useStore((s) => s.ticks);
  const [account, setAccount] = useState<Record<string, number>>({});

  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/account').then((r) => r.json()).then(setAccount).catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const equity = account.equity || balance;
  const unrealized = account.unrealized_pnl || 0;
  const margin = account.margin_used || 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-border text-xs font-bold text-text-secondary uppercase tracking-wider">
        Account
      </div>
      <div className="p-3 flex flex-col gap-2 text-xs">
        <Row label="Balance" value={`$${balance.toLocaleString('en', { minimumFractionDigits: 2 })}`} />
        <Row label="Equity" value={`$${equity.toLocaleString('en', { minimumFractionDigits: 2 })}`} />
        <div className="border-t border-border/50 my-1" />
        <Row
          label="Daily P&L"
          value={`${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)}`}
          valueClass={dailyPnl >= 0 ? 'text-green' : 'text-red'}
        />
        <Row
          label="Unrealized"
          value={`${unrealized >= 0 ? '+' : ''}$${unrealized.toFixed(2)}`}
          valueClass={unrealized >= 0 ? 'text-green' : 'text-red'}
        />
        <div className="border-t border-border/50 my-1" />
        <Row label="Margin Used" value={`$${margin.toLocaleString('en', { minimumFractionDigits: 2 })}`} />
        <Row label="Positions" value={`${positions.length}`} />
      </div>
    </div>
  );
}

function Row({ label, value, valueClass = 'text-text-primary' }: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-text-muted">{label}</span>
      <span className={`font-mono font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}
