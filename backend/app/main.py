import asyncio
import json
import math
import os
import random
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from .models import init_db, get_db, async_session, Trade, Order, BotConfig

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"


# ─── Market Simulator (Demo Mode) ──────────────────────────
class DemoMarket:
    """Generates realistic ES futures ticks using Brownian motion + mean reversion."""

    def __init__(self):
        self.symbols = {
            "ES": {"price": 5890.00, "tick": 0.25, "point_val": 50.0, "vol": 0.0003},
            "NQ": {"price": 21150.00, "tick": 0.25, "point_val": 20.0, "vol": 0.0004},
            "CL": {"price": 71.50, "tick": 0.01, "point_val": 1000.0, "vol": 0.0005},
        }
        self.bars = {sym: [] for sym in self.symbols}
        self.current_bar = {}
        self.bar_start = {}
        self._init_bars()

    def _init_bars(self):
        now = time.time()
        for sym, info in self.symbols.items():
            p = info["price"]
            self.current_bar[sym] = {"o": p, "h": p, "l": p, "c": p, "v": 0, "t": now}
            self.bar_start[sym] = now

    def tick(self, symbol: str) -> dict:
        info = self.symbols[symbol]
        p = info["price"]
        # Brownian motion + mean reversion
        drift = (5890.0 - p) * 0.00001 if symbol == "ES" else 0
        change = random.gauss(drift, info["vol"]) * p
        tick_size = info["tick"]
        p = round(round((p + change) / tick_size) * tick_size, 2)
        info["price"] = p
        vol = random.randint(1, 50)

        now = time.time()
        bar = self.current_bar[symbol]
        bar["h"] = max(bar["h"], p)
        bar["l"] = min(bar["l"], p)
        bar["c"] = p
        bar["v"] += vol

        # Close bar every 5 seconds
        new_bar = None
        if now - self.bar_start[symbol] >= 5.0:
            new_bar = {**bar, "symbol": symbol, "tf": "5s"}
            self.bars[symbol].append(new_bar)
            if len(self.bars[symbol]) > 2000:
                self.bars[symbol] = self.bars[symbol][-2000:]
            self.current_bar[symbol] = {"o": p, "h": p, "l": p, "c": p, "v": 0, "t": now}
            self.bar_start[symbol] = now

        return {
            "type": "tick",
            "symbol": symbol,
            "price": p,
            "size": vol,
            "time": now,
            "bar": new_bar,
        }

    def get_dom(self, symbol: str, depth: int = 10) -> dict:
        p = self.symbols[symbol]["price"]
        tick = self.symbols[symbol]["tick"]
        bids = [[round(p - tick * i, 2), random.randint(10, 300)] for i in range(1, depth + 1)]
        asks = [[round(p + tick * i, 2), random.randint(10, 300)] for i in range(depth)]
        return {"type": "dom", "symbol": symbol, "bids": bids, "asks": asks}


# ─── Demo Account ──────────────────────────────
class DemoAccount:
    def __init__(self):
        self.balance = 50000.0
        self.daily_pnl = 0.0
        self.positions: list[dict] = []
        self.orders: list[dict] = []
        self.trades: list[dict] = []
        self._next_order_id = 1

    def place_order(self, symbol: str, side: str, qty: int, order_type: str,
                    price: Optional[float], market: DemoMarket) -> dict:
        oid = self._next_order_id
        self._next_order_id += 1

        fill_price = market.symbols[symbol]["price"]
        if order_type == "LMT" and price is not None:
            fill_price = price
        elif order_type == "STP" and price is not None:
            fill_price = price

        # Immediate fill for market orders in demo
        order = {
            "id": oid, "symbol": symbol, "side": side, "qty": qty,
            "order_type": order_type, "price": fill_price,
            "status": "filled" if order_type == "MKT" else "pending",
            "created_at": datetime.utcnow().isoformat(),
            "filled_at": datetime.utcnow().isoformat() if order_type == "MKT" else None,
        }
        self.orders.append(order)

        if order_type == "MKT":
            self._apply_fill(symbol, side, qty, fill_price, market)

        return order

    def _apply_fill(self, symbol: str, side: str, qty: int, price: float, market: DemoMarket):
        # Check if closing an existing position
        for pos in self.positions:
            if pos["symbol"] == symbol:
                if (pos["side"] == "LONG" and side == "SELL") or \
                   (pos["side"] == "SHORT" and side == "BUY"):
                    # Close position
                    point_val = market.symbols[symbol]["point_val"]
                    if pos["side"] == "LONG":
                        pnl = (price - pos["avg_price"]) * point_val * pos["qty"]
                    else:
                        pnl = (pos["avg_price"] - price) * point_val * pos["qty"]
                    self.daily_pnl += pnl
                    self.balance += pnl
                    trade = {
                        "id": len(self.trades) + 1,
                        "symbol": symbol,
                        "side": pos["side"],
                        "qty": pos["qty"],
                        "entry_price": pos["avg_price"],
                        "exit_price": price,
                        "pnl": round(pnl, 2),
                        "entry_time": pos["entry_time"],
                        "exit_time": datetime.utcnow().isoformat(),
                        "exit_type": "manual",
                    }
                    self.trades.append(trade)
                    self.positions.remove(pos)
                    return trade
                break

        # New position
        pos_side = "LONG" if side == "BUY" else "SHORT"
        self.positions.append({
            "symbol": symbol, "side": pos_side, "qty": qty,
            "avg_price": price, "entry_time": datetime.utcnow().isoformat(),
        })
        return None

    def flatten(self, market: DemoMarket) -> list:
        closed = []
        for pos in list(self.positions):
            side = "SELL" if pos["side"] == "LONG" else "BUY"
            trade = self._apply_fill(pos["symbol"], side, pos["qty"],
                                     market.symbols[pos["symbol"]]["price"], market)
            if trade:
                closed.append(trade)
        return closed

    def get_positions_with_pnl(self, market: DemoMarket) -> list:
        result = []
        for pos in self.positions:
            current = market.symbols[pos["symbol"]]["price"]
            point_val = market.symbols[pos["symbol"]]["point_val"]
            if pos["side"] == "LONG":
                unrealized = (current - pos["avg_price"]) * point_val * pos["qty"]
            else:
                unrealized = (pos["avg_price"] - current) * point_val * pos["qty"]
            result.append({**pos, "current_price": current, "unrealized_pnl": round(unrealized, 2)})
        return result


# ─── WebSocket Manager ──────────────────────────
class ConnectionManager:
    def __init__(self):
        self.connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.connections.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.connections:
            self.connections.remove(ws)

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.connections:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.connections.remove(ws)


# ─── Globals ──────────────────────────
market = DemoMarket()
account = DemoAccount()
ws_manager = ConnectionManager()
_market_task = None


async def market_loop():
    """Background task: generate ticks and broadcast via WebSocket."""
    while True:
        for sym in ["ES", "NQ", "CL"]:
            data = market.tick(sym)
            await ws_manager.broadcast({"type": "tick", "symbol": data["symbol"],
                                        "price": data["price"], "size": data["size"],
                                        "time": data["time"]})
            if data["bar"]:
                await ws_manager.broadcast(data["bar"])

            # Update unrealized P&L
            for pos in account.positions:
                if pos["symbol"] == sym:
                    point_val = market.symbols[sym]["point_val"]
                    current = data["price"]
                    if pos["side"] == "LONG":
                        unrealized = (current - pos["avg_price"]) * point_val * pos["qty"]
                    else:
                        unrealized = (pos["avg_price"] - current) * point_val * pos["qty"]
                    await ws_manager.broadcast({
                        "type": "position", "symbol": sym, "side": pos["side"],
                        "qty": pos["qty"], "avg_price": pos["avg_price"],
                        "unrealized_pnl": round(unrealized, 2),
                    })

        await asyncio.sleep(1.0)

        # DOM updates every cycle
        for sym in ["ES", "NQ", "CL"]:
            await ws_manager.broadcast(market.get_dom(sym))


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _market_task
    try:
        await init_db()
    except Exception:
        pass  # DB might not be running yet, demo mode works without it
    if DEMO_MODE:
        _market_task = asyncio.create_task(market_loop())
    yield
    if _market_task:
        _market_task.cancel()


# ─── FastAPI App ──────────────────────────
app = FastAPI(title="QuadScalp Trading Platform", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Pydantic Models ──────────────────────────
class OrderRequest(BaseModel):
    symbol: str = "ES"
    side: str  # BUY or SELL
    qty: int = 1
    order_type: str = "MKT"  # MKT, LMT, STP
    price: Optional[float] = None


# ─── WebSocket Endpoint ──────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    # Send initial state
    try:
        await ws.send_json({
            "type": "init",
            "demo_mode": DEMO_MODE,
            "symbols": {sym: {"price": info["price"], "tick": info["tick"]}
                        for sym, info in market.symbols.items()},
            "account": {
                "balance": account.balance,
                "daily_pnl": account.daily_pnl,
            },
        })
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            # Handle client messages (e.g., subscribe to specific symbols)
            if msg.get("type") == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
    except Exception:
        ws_manager.disconnect(ws)


# ─── REST Endpoints ──────────────────────────

@app.get("/api/account")
async def get_account():
    positions_pnl = sum(
        p["unrealized_pnl"]
        for p in account.get_positions_with_pnl(market)
    )
    return {
        "balance": round(account.balance, 2),
        "equity": round(account.balance + positions_pnl, 2),
        "daily_pnl": round(account.daily_pnl, 2),
        "unrealized_pnl": round(positions_pnl, 2),
        "margin_used": len(account.positions) * 6930.0,  # ES margin ~$6930
        "positions_count": len(account.positions),
        "demo_mode": DEMO_MODE,
    }


@app.get("/api/positions")
async def get_positions():
    return account.get_positions_with_pnl(market)


@app.get("/api/orders")
async def get_orders():
    return [o for o in account.orders if o["status"] == "pending"]


@app.post("/api/orders")
async def place_order(req: OrderRequest):
    if req.side not in ("BUY", "SELL"):
        raise HTTPException(400, "side must be BUY or SELL")
    if req.order_type not in ("MKT", "LMT", "STP"):
        raise HTTPException(400, "order_type must be MKT, LMT, or STP")
    if req.order_type in ("LMT", "STP") and req.price is None:
        raise HTTPException(400, "price required for LMT/STP orders")

    order = account.place_order(req.symbol, req.side, req.qty, req.order_type, req.price, market)

    # Broadcast fill
    if order["status"] == "filled":
        await ws_manager.broadcast({
            "type": "fill", "order_id": order["id"],
            "symbol": req.symbol, "side": req.side,
            "price": order["price"], "qty": req.qty,
        })
        await ws_manager.broadcast({
            "type": "account",
            "balance": round(account.balance, 2),
            "daily_pnl": round(account.daily_pnl, 2),
        })

    return order


@app.delete("/api/orders/{order_id}")
async def cancel_order(order_id: int):
    for o in account.orders:
        if o["id"] == order_id and o["status"] == "pending":
            o["status"] = "cancelled"
            return {"status": "cancelled"}
    raise HTTPException(404, "Order not found or already filled")


@app.post("/api/orders/flatten")
async def flatten_all():
    closed = account.flatten(market)
    if closed:
        await ws_manager.broadcast({
            "type": "account",
            "balance": round(account.balance, 2),
            "daily_pnl": round(account.daily_pnl, 2),
        })
    return {"closed": len(closed), "trades": closed}


@app.get("/api/trades")
async def get_trades():
    return list(reversed(account.trades[-50:]))


@app.get("/api/market/{symbol}")
async def get_market(symbol: str):
    symbol = symbol.upper()
    if symbol not in market.symbols:
        raise HTTPException(404, f"Symbol {symbol} not found")
    info = market.symbols[symbol]
    dom = market.get_dom(symbol)
    return {
        "symbol": symbol,
        "price": info["price"],
        "tick_size": info["tick"],
        "point_value": info["point_val"],
        "dom": dom,
    }


@app.get("/api/bars/{symbol}")
async def get_bars(symbol: str, tf: str = "5s", count: int = 500):
    symbol = symbol.upper()
    if symbol not in market.symbols:
        raise HTTPException(404, f"Symbol {symbol} not found")
    bars = market.bars.get(symbol, [])[-count:]
    return bars


@app.get("/api/bot/status")
async def bot_status():
    return {"running": False, "signals": [], "stats": {}}


@app.post("/api/bot/start")
async def bot_start():
    return {"status": "not_implemented", "message": "Bot C++ integration coming in Phase 2"}


@app.post("/api/bot/stop")
async def bot_stop():
    return {"status": "not_implemented"}


# Health check
@app.get("/api/health")
async def health():
    return {"status": "ok", "demo_mode": DEMO_MODE, "version": "1.0.0"}
