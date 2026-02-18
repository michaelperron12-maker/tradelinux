import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { useStore } from '../store';

export default function Chart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ReturnType<ReturnType<typeof createChart>['addSeries']> | null>(null);
  const volumeRef = useRef<ReturnType<ReturnType<typeof createChart>['addSeries']> | null>(null);
  const activeSymbol = useStore((s) => s.activeSymbol);
  const bars = useStore((s) => s.bars[s.activeSymbol] || []);
  const lastTick = useStore((s) => s.ticks[s.activeSymbol]);

  // Create chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0a0e17' },
        textColor: '#94a3b8',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: '#3b82f6', width: 1, style: 2 },
        horzLine: { color: '#3b82f6', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: true,
      },
    });

    // v5 API: addSeries(SeriesType, options)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#3b82f680',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;
    volumeRef.current = volumeSeries;

    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, []);

  // Update data when bars change
  useEffect(() => {
    if (!seriesRef.current || !volumeRef.current) return;
    if (bars.length === 0) return;

    try {
      const candles = bars.map((b) => ({
        time: Math.floor(b.t) as any,
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
      }));

      const volumes = bars.map((b) => ({
        time: Math.floor(b.t) as any,
        value: b.v,
        color: b.c >= b.o ? '#22c55e40' : '#ef444440',
      }));

      seriesRef.current.setData(candles);
      volumeRef.current.setData(volumes);
    } catch (e) {
      console.warn('Chart setData error:', e);
    }
  }, [bars.length]);

  // Update last candle on tick
  useEffect(() => {
    if (!seriesRef.current || !lastTick) return;
    if (bars.length === 0) return;
    try {
      const lastBar = bars[bars.length - 1];
      seriesRef.current.update({
        time: Math.floor(lastBar.t) as any,
        open: lastBar.o,
        high: Math.max(lastBar.h, lastTick.price),
        low: Math.min(lastBar.l, lastTick.price),
        close: lastTick.price,
      });
    } catch (e) {
      // Ignore update errors
    }
  }, [lastTick?.price]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border text-xs">
        <span className="text-accent font-bold">{activeSymbol}</span>
        <span className="text-text-secondary">5s</span>
        {lastTick && (
          <>
            <span className={`font-mono font-bold ${lastTick.change && lastTick.change >= 0 ? 'text-green' : 'text-red'}`}>
              {lastTick.price.toFixed(2)}
            </span>
            <span className={`font-mono text-[10px] ${lastTick.change && lastTick.change >= 0 ? 'text-green' : 'text-red'}`}>
              {lastTick.change && lastTick.change >= 0 ? '+' : ''}{lastTick.change?.toFixed(2) || '0.00'}
            </span>
          </>
        )}
        <span className="text-text-muted ml-auto">{bars.length} bars</span>
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  );
}
