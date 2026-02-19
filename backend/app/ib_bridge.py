"""
IB Gateway Bridge — Connects to Interactive Brokers for live CME data & order execution.

Setup for client:
1. Create IB account: https://www.interactivebrokers.com/en/trading/open-account.php
2. Download IB Gateway: https://www.interactivebrokers.com/en/trading/ibgateway-stable.php
3. Subscribe to CME data ($15/month): Account → Market Data Subscriptions → CME

Connection:
- Paper trading: port 4002 (safe, no real money)
- Live trading: port 4001 (real money!)
- Set in .env: IB_PORT=4002 or IB_PORT=4001
"""

import asyncio
import os
import logging
from datetime import datetime
from typing import Optional, Callable

logger = logging.getLogger("ib_bridge")

# Contracts for CME futures
CONTRACTS = {
    "ES": {"symbol": "ES", "exchange": "CME", "secType": "FUT", "currency": "USD", "tick": 0.25, "point_val": 50.0},
    "NQ": {"symbol": "NQ", "exchange": "CME", "secType": "FUT", "currency": "USD", "tick": 0.25, "point_val": 20.0},
    "CL": {"symbol": "CL", "exchange": "NYMEX", "secType": "FUT", "currency": "USD", "tick": 0.01, "point_val": 1000.0},
}


class IBBridge:
    """Manages connection to IB Gateway and provides market data + order execution."""

    def __init__(self):
        self.ib = None
        self.connected = False
        self.host = os.getenv("IB_HOST", "127.0.0.1")
        self.port = int(os.getenv("IB_PORT", "4002"))
        self.client_id = int(os.getenv("IB_CLIENT_ID", "1"))
        self.contracts = {}
        self.on_tick: Optional[Callable] = None
        self.on_bar: Optional[Callable] = None
        self.on_dom: Optional[Callable] = None

    async def connect(self) -> bool:
        """Connect to IB Gateway."""
        try:
            from ib_insync import IB, util
            util.patchAsyncio()  # Required for ib_insync + asyncio

            self.ib = IB()
            await self.ib.connectAsync(self.host, self.port, clientId=self.client_id)
            self.connected = True
            logger.info(f"Connected to IB Gateway at {self.host}:{self.port}")

            # Create contracts
            await self._setup_contracts()

            # Subscribe to market data
            await self._subscribe_market_data()

            return True
        except Exception as e:
            logger.error(f"Failed to connect to IB Gateway: {e}")
            self.connected = False
            return False

    async def _setup_contracts(self):
        """Create and qualify IB contracts for ES, NQ, CL."""
        from ib_insync import Future

        for sym, info in CONTRACTS.items():
            contract = Future(
                symbol=info["symbol"],
                exchange=info["exchange"],
                currency=info["currency"],
            )
            # Qualify to get the front-month contract
            qualified = await self.ib.qualifyContractsAsync(contract)
            if qualified:
                self.contracts[sym] = qualified[0]
                logger.info(f"Contract ready: {sym} → {qualified[0].localSymbol}")
            else:
                logger.warning(f"Could not qualify contract for {sym}")

    async def _subscribe_market_data(self):
        """Subscribe to real-time ticks and DOM for all contracts."""
        for sym, contract in self.contracts.items():
            # Real-time bars (5 second)
            self.ib.reqRealTimeBars(contract, 5, 'TRADES', False)

            # Market depth (DOM)
            self.ib.reqMktDepth(contract, numRows=10)

            # Tick data
            self.ib.reqMktData(contract)

        # Set up event handlers
        self.ib.pendingTickersEvent += self._on_pending_tickers
        self.ib.updateEvent += self._on_update

    def _on_pending_tickers(self, tickers):
        """Handle incoming tick data."""
        for ticker in tickers:
            sym = self._find_symbol(ticker.contract)
            if sym and ticker.last:
                if self.on_tick:
                    asyncio.ensure_future(self.on_tick({
                        "type": "tick",
                        "symbol": sym,
                        "price": ticker.last,
                        "size": ticker.lastSize or 0,
                        "time": datetime.utcnow().timestamp(),
                        "bid": ticker.bid,
                        "ask": ticker.ask,
                    }))

    def _on_update(self, *args):
        """Handle real-time bar updates."""
        pass

    def _find_symbol(self, contract) -> Optional[str]:
        """Find our symbol name from an IB contract."""
        for sym, c in self.contracts.items():
            if c.conId == contract.conId:
                return sym
        return None

    # ── Order Execution ──

    async def place_order(self, symbol: str, side: str, qty: int,
                          order_type: str, price: Optional[float] = None) -> dict:
        """Place an order through IB."""
        from ib_insync import MarketOrder, LimitOrder, StopOrder

        contract = self.contracts.get(symbol)
        if not contract:
            return {"error": f"No contract for {symbol}"}

        action = "BUY" if side == "BUY" else "SELL"

        if order_type == "MKT":
            order = MarketOrder(action, qty)
        elif order_type == "LMT":
            order = LimitOrder(action, qty, price)
        elif order_type == "STP":
            order = StopOrder(action, qty, price)
        else:
            return {"error": f"Unknown order type: {order_type}"}

        trade = self.ib.placeOrder(contract, order)
        logger.info(f"Order placed: {side} {qty} {symbol} @ {order_type} {price or 'MKT'}")

        return {
            "id": trade.order.orderId,
            "symbol": symbol,
            "side": side,
            "qty": qty,
            "order_type": order_type,
            "price": price,
            "status": "submitted",
        }

    async def cancel_order(self, order_id: int) -> bool:
        """Cancel an open order."""
        for trade in self.ib.openTrades():
            if trade.order.orderId == order_id:
                self.ib.cancelOrder(trade.order)
                return True
        return False

    async def flatten(self, symbol: Optional[str] = None) -> list:
        """Close all positions (or for a specific symbol)."""
        closed = []
        for pos in self.ib.positions():
            sym = self._find_symbol(pos.contract)
            if symbol and sym != symbol:
                continue
            if pos.position != 0:
                side = "SELL" if pos.position > 0 else "BUY"
                qty = abs(pos.position)
                result = await self.place_order(sym or "", side, qty, "MKT")
                closed.append(result)
        return closed

    # ── Account Info ──

    async def get_account(self) -> dict:
        """Get account summary."""
        summary = self.ib.accountSummary()
        result = {"balance": 0, "equity": 0, "margin_used": 0, "daily_pnl": 0}
        for item in summary:
            if item.tag == "TotalCashBalance" and item.currency == "USD":
                result["balance"] = float(item.value)
            elif item.tag == "NetLiquidation" and item.currency == "USD":
                result["equity"] = float(item.value)
            elif item.tag == "MaintMarginReq" and item.currency == "USD":
                result["margin_used"] = float(item.value)
        # P&L
        pnl = self.ib.pnl()
        if pnl:
            result["daily_pnl"] = pnl[0].dailyPnL or 0
            result["unrealized_pnl"] = pnl[0].unrealizedPnL or 0
        return result

    async def get_positions(self) -> list:
        """Get all open positions with P&L."""
        positions = []
        for pos in self.ib.positions():
            sym = self._find_symbol(pos.contract)
            if sym and pos.position != 0:
                side = "LONG" if pos.position > 0 else "SHORT"
                positions.append({
                    "symbol": sym,
                    "side": side,
                    "qty": abs(pos.position),
                    "avg_price": pos.avgCost / CONTRACTS[sym]["point_val"] if sym in CONTRACTS else pos.avgCost,
                    "entry_time": "",
                })
        return positions

    async def get_dom(self, symbol: str) -> dict:
        """Get current DOM for a symbol."""
        contract = self.contracts.get(symbol)
        if not contract:
            return {"bids": [], "asks": []}

        ticker = self.ib.ticker(contract)
        if not ticker or not ticker.domBids:
            return {"bids": [], "asks": []}

        bids = [[b.price, b.size] for b in ticker.domBids if b.price > 0]
        asks = [[a.price, a.size] for a in ticker.domAsks if a.price > 0]
        return {"type": "dom", "symbol": symbol, "bids": bids, "asks": asks}

    # ── Historical Data ──

    async def get_bars(self, symbol: str, tf: str = "5 secs", count: int = 500) -> list:
        """Get historical bars."""
        contract = self.contracts.get(symbol)
        if not contract:
            return []

        bars = await self.ib.reqHistoricalDataAsync(
            contract,
            endDateTime="",
            durationStr="1800 S",
            barSizeSetting=tf,
            whatToShow="TRADES",
            useRTH=False,
        )

        return [
            {"o": b.open, "h": b.high, "l": b.low, "c": b.close, "v": b.volume,
             "t": b.date.timestamp(), "symbol": symbol, "tf": tf}
            for b in bars[-count:]
        ]

    async def disconnect(self):
        """Disconnect from IB Gateway."""
        if self.ib and self.connected:
            self.ib.disconnect()
            self.connected = False
            logger.info("Disconnected from IB Gateway")


# Singleton
ib_bridge = IBBridge()
