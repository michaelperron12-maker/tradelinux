from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, JSON
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from datetime import datetime
import os


class Base(DeclarativeBase):
    pass


class Trade(Base):
    __tablename__ = "trades"
    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(10), nullable=False)
    side = Column(String(4), nullable=False)
    qty = Column(Integer, nullable=False, default=1)
    entry_price = Column(Float, nullable=False)
    exit_price = Column(Float, nullable=True)
    pnl = Column(Float, nullable=True)
    entry_time = Column(DateTime, default=datetime.utcnow)
    exit_time = Column(DateTime, nullable=True)
    exit_type = Column(String(20), nullable=True)
    bot_signal = Column(JSON, nullable=True)


class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, autoincrement=True)
    ib_order_id = Column(Integer, nullable=True)
    symbol = Column(String(10), nullable=False)
    side = Column(String(4), nullable=False)
    qty = Column(Integer, nullable=False, default=1)
    order_type = Column(String(10), nullable=False)
    price = Column(Float, nullable=True)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    filled_at = Column(DateTime, nullable=True)


class BotConfig(Base):
    __tablename__ = "bot_config"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False)
    config = Column(JSON, nullable=False, default=dict)
    active = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Bar(Base):
    __tablename__ = "bars"
    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(10), nullable=False)
    timeframe = Column(String(5), nullable=False)
    timestamp = Column(DateTime, nullable=False)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Integer, default=0)


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://quadscalp:quadscalp2026@localhost:5433/quadscalp")
engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with async_session() as session:
        yield session
