import { useEffect, useRef, useCallback } from 'react';
import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts';

interface Bar {
  o: number; h: number; l: number; c: number; v: number; t: number;
}

export default function PriceChart({ symbol, price }: { symbol: string; price?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleRef = useRef<any>(null);
  const volRef = useRef<any>(null);
  const barsRef = useRef<Bar[]>([]);

  // Fetch bars from API
  const fetchBars = useCallback(async () => {
    try {
      const resp = await fetch(`/api/bars/${symbol}?count=500`);
      const data: Bar[] = await resp.json();
      if (!data || data.length === 0) return;
      barsRef.current = data;

      if (candleRef.current) {
        candleRef.current.setData(data.map(b => ({
          time: Math.floor(b.t) as any,
          open: b.o, high: b.h, low: b.l, close: b.c,
        })));
      }
      if (volRef.current) {
        volRef.current.setData(data.map(b => ({
          time: Math.floor(b.t) as any,
          value: b.v,
          color: b.c >= b.o ? '#22c55e30' : '#ef444430',
        })));
      }
    } catch (e) {
      // ignore
    }
  }, [symbol]);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: { background: { color: '#0a0e17' }, textColor: '#94a3b8', fontSize: 12 },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      crosshair: {
        mode: 0,
        vertLine: { color: '#3b82f6', width: 1, style: 2 },
        horzLine: { color: '#3b82f6', width: 1, style: 2 },
      },
      rightPriceScale: { borderColor: '#1e293b', scaleMargins: { top: 0.05, bottom: 0.15 } },
      timeScale: { borderColor: '#1e293b', timeVisible: true, secondsVisible: true },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });

    const volumes = chart.addSeries(HistogramSeries, {
      color: '#3b82f680',
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });

    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candles;
    volRef.current = volumes;

    // Resize
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    // Initial fetch
    fetchBars();

    // Poll bars every 5 seconds
    const interval = setInterval(fetchBars, 5000);

    return () => {
      clearInterval(interval);
      ro.disconnect();
      chart.remove();
    };
  }, [symbol]);

  // Update last candle with live price
  useEffect(() => {
    if (!candleRef.current || !price || barsRef.current.length === 0) return;
    try {
      const last = barsRef.current[barsRef.current.length - 1];
      candleRef.current.update({
        time: Math.floor(last.t) as any,
        open: last.o,
        high: Math.max(last.h, price),
        low: Math.min(last.l, price),
        close: price,
      });
    } catch {
      // ignore
    }
  }, [price]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
