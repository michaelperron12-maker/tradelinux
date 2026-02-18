// ============================================================================
// QuadScalp Mini Test — C++ Scalping Prototype (Zero Dependencies)
// Simulated ES Futures | RSI + EMA + VWAP + ATR | Multi-Signal Scoring
// Build: g++ -O3 -std=c++20 -o mini_test mini_test.cpp
// ============================================================================
#include <cstdio>
#include <cmath>
#include <cstdint>
#include <random>
#include <vector>
#include <algorithm>
#include <numeric>
#include <chrono>
#include <thread>
#include <string>
#include <fstream>

// ── Types ───────────────────────────────────────────────────────────────────
struct Bar {
    int    index;
    double open, high, low, close;
    double volume;
    double vwap;
};

enum class Side { NONE, LONG, SHORT };
enum class TradeAction { NONE, BUY, SELL };

struct Signal {
    TradeAction action;
    double      score;       // -1.0 to +1.0
    std::string reasons;
};

struct Trade {
    int    entry_bar;
    int    exit_bar;
    Side   side;
    double entry_price;
    double exit_price;
    double pnl;
    std::string exit_reason;
};

// ── RSI (Wilder's Smoothing — same as NinjaTrader) ─────────────────────────
class RSI {
    int period_;
    double avg_gain_ = 0, avg_loss_ = 0, prev_ = 0, val_ = 50;
    int n_ = 0;
public:
    explicit RSI(int p = 14) : period_(p) {}
    void update(double close) {
        if (n_ == 0) { prev_ = close; ++n_; return; }
        double chg = close - prev_;
        double g = chg > 0 ? chg : 0;
        double l = chg < 0 ? -chg : 0;
        if (n_ <= period_) {
            avg_gain_ += g; avg_loss_ += l;
            if (n_ == period_) { avg_gain_ /= period_; avg_loss_ /= period_; }
        } else {
            avg_gain_ = (avg_gain_ * (period_ - 1) + g) / period_;
            avg_loss_ = (avg_loss_ * (period_ - 1) + l) / period_;
        }
        if (n_ >= period_) {
            val_ = avg_loss_ < 1e-10 ? 100.0 : 100.0 - 100.0 / (1.0 + avg_gain_ / avg_loss_);
        }
        prev_ = close; ++n_;
    }
    double value() const { return val_; }
    bool ready() const { return n_ > period_; }
};

// ── EMA ─────────────────────────────────────────────────────────────────────
class EMA {
    int period_;
    double mult_, val_ = 0, sum_ = 0;
    int n_ = 0;
public:
    explicit EMA(int p) : period_(p), mult_(2.0 / (p + 1)) {}
    void update(double v) {
        if (n_ < period_) { sum_ += v; ++n_; if (n_ == period_) val_ = sum_ / period_; }
        else { val_ = (v - val_) * mult_ + val_; ++n_; }
    }
    double value() const { return val_; }
    bool ready() const { return n_ >= period_; }
};

// ── VWAP ────────────────────────────────────────────────────────────────────
class VWAP {
    double cum_vp_ = 0, cum_v_ = 0, val_ = 0;
public:
    void update(double price, double vol) {
        cum_vp_ += price * vol; cum_v_ += vol;
        if (cum_v_ > 0) val_ = cum_vp_ / cum_v_;
    }
    double value() const { return val_; }
    bool ready() const { return cum_v_ > 0; }
    void reset() { cum_vp_ = cum_v_ = val_ = 0; }
};

// ── ATR ─────────────────────────────────────────────────────────────────────
class ATR {
    int period_;
    double val_ = 0, prev_c_ = 0, sum_ = 0;
    int n_ = 0;
public:
    explicit ATR(int p = 14) : period_(p) {}
    void update(double h, double l, double c) {
        if (n_ == 0) { prev_c_ = c; ++n_; return; }
        double tr = std::max({h - l, std::abs(h - prev_c_), std::abs(l - prev_c_)});
        if (n_ <= period_) { sum_ += tr; if (n_ == period_) val_ = sum_ / period_; }
        else { val_ = (val_ * (period_ - 1) + tr) / period_; }
        prev_c_ = c; ++n_;
    }
    double value() const { return val_; }
    bool ready() const { return n_ > period_; }
};

// ── Signal Engine (Multi-Indicator Weighted Scoring) ────────────────────────
class SignalEngine {
    RSI  rsi_;
    EMA  ema_fast_, ema_slow_;
    EMA  ema_trend_;         // 50-period trend filter
    VWAP vwap_;
    ATR  atr_;

    double prev_ef_ = 0, prev_es_ = 0;
    double vol_sum_ = 0;
    int    vol_n_ = 0;
    double avg_vol_ = 0;

    // Weights
    static constexpr double W_RSI   = 0.20;
    static constexpr double W_EMA   = 0.25;
    static constexpr double W_VWAP  = 0.15;
    static constexpr double W_MOM   = 0.15;
    static constexpr double W_VOL   = 0.10;
    static constexpr double W_TREND = 0.15;   // Trend filter
    static constexpr double MIN_SCORE = 0.50;

public:
    SignalEngine() : rsi_(14), ema_fast_(9), ema_slow_(21), ema_trend_(50), atr_(14) {}

    Signal evaluate(const Bar& bar) {
        rsi_.update(bar.close);
        ema_fast_.update(bar.close);
        ema_slow_.update(bar.close);
        ema_trend_.update(bar.close);
        vwap_.update(bar.close, bar.volume);
        atr_.update(bar.high, bar.low, bar.close);

        // Volume tracking
        vol_sum_ += bar.volume; ++vol_n_;
        if (vol_n_ > 20) { avg_vol_ = vol_sum_ / vol_n_; vol_sum_ = avg_vol_ * 19 + bar.volume; vol_n_ = 20; }

        if (!rsi_.ready() || !ema_fast_.ready() || !ema_slow_.ready() || !atr_.ready() || !ema_trend_.ready())
            return {TradeAction::NONE, 0, ""};

        // Anti-chop filter: don't trade in dead markets
        if (atr_.value() < 0.50) return {TradeAction::NONE, 0, ""};

        double score = 0;
        std::string reasons;

        // 1. RSI momentum
        double rsi_v = rsi_.value();
        double rsi_score = 0;
        if      (rsi_v < 30) rsi_score = +0.9;
        else if (rsi_v < 40) rsi_score = +0.4;
        else if (rsi_v > 70) rsi_score = -0.9;
        else if (rsi_v > 60) rsi_score = -0.4;
        score += W_RSI * rsi_score;
        if (std::abs(rsi_score) > 0.3) reasons += (rsi_score > 0 ? "RSI_oversold " : "RSI_overbought ");

        // 2. EMA crossover
        double ef = ema_fast_.value(), es = ema_slow_.value();
        double ema_score = 0;
        if (prev_ef_ > 0) {
            bool cross_up   = prev_ef_ <= prev_es_ && ef > es;
            bool cross_down = prev_ef_ >= prev_es_ && ef < es;
            if (cross_up)   { ema_score = +1.0; reasons += "EMA_cross_up "; }
            if (cross_down) { ema_score = -1.0; reasons += "EMA_cross_down "; }
            if (!cross_up && !cross_down) {
                ema_score = ef > es ? +0.3 : -0.3;
            }
        }
        prev_ef_ = ef; prev_es_ = es;
        score += W_EMA * std::clamp(ema_score, -1.0, 1.0);

        // 3. VWAP
        if (vwap_.ready() && atr_.ready() && atr_.value() > 0) {
            double dist = (bar.close - vwap_.value()) / atr_.value();
            double vs = std::clamp(dist * 0.5, -1.0, 1.0);
            score += W_VWAP * vs;
            if (std::abs(vs) > 0.4) reasons += (vs > 0 ? "above_VWAP " : "below_VWAP ");
        }

        // 4. Momentum (price change acceleration)
        double mom_score = 0;
        if (bar.close > bar.open) mom_score = std::min((bar.close - bar.open) / (atr_.ready() ? atr_.value() : 1.0), 1.0);
        else mom_score = std::max((bar.close - bar.open) / (atr_.ready() ? atr_.value() : 1.0), -1.0);
        score += W_MOM * mom_score;

        // 5. Volume spike
        bool vol_spike = avg_vol_ > 0 && bar.volume > 1.5 * avg_vol_;
        double vol_score = vol_spike ? (bar.close > bar.open ? 1.0 : -1.0) : 0.0;
        score += W_VOL * vol_score;
        if (vol_spike) reasons += "VOL_spike ";

        // 6. Trend filter (EMA 50) — trade WITH the trend only
        double trend_score = 0;
        if (bar.close > ema_trend_.value()) { trend_score = +0.8; reasons += "UPTREND "; }
        else { trend_score = -0.8; reasons += "DOWNTREND "; }
        score += W_TREND * trend_score;

        // Anti-trend filter: block buys in downtrend, sells in uptrend
        TradeAction action = TradeAction::NONE;
        bool uptrend = bar.close > ema_trend_.value() && ema_fast_.value() > ema_trend_.value();
        bool downtrend = bar.close < ema_trend_.value() && ema_fast_.value() < ema_trend_.value();

        if (score >= MIN_SCORE && uptrend)   action = TradeAction::BUY;
        if (score <= -MIN_SCORE && downtrend) action = TradeAction::SELL;

        return {action, score, reasons};
    }

    double rsi()      const { return rsi_.value(); }
    double ema9()     const { return ema_fast_.value(); }
    double ema21()    const { return ema_slow_.value(); }
    double vwap_val() const { return vwap_.value(); }
    double atr_val()  const { return atr_.value(); }
};

// ── Risk Manager ────────────────────────────────────────────────────────────
class RiskManager {
    double max_daily_loss_;
    double max_per_trade_;
    int    max_trades_;
    double daily_pnl_ = 0;
    int    trade_count_ = 0;
    int    consec_losses_ = 0;
    bool   killed_ = false;
public:
    RiskManager(double mdl = -500, double mpt = -150, int mt = 50)
        : max_daily_loss_(mdl), max_per_trade_(mpt), max_trades_(mt) {}

    bool can_trade() const {
        return !killed_ && trade_count_ < max_trades_ && daily_pnl_ > max_daily_loss_;
    }
    void record(double pnl) {
        daily_pnl_ += pnl; ++trade_count_;
        if (pnl < 0) { ++consec_losses_; if (consec_losses_ >= 5) killed_ = true; }
        else consec_losses_ = 0;
        if (daily_pnl_ <= max_daily_loss_) killed_ = true;
    }
    bool is_killed() const { return killed_; }
    double daily_pnl() const { return daily_pnl_; }
    int trades() const { return trade_count_; }
};

// ── Market Simulator (Brownian Motion + Mean Reversion) ─────────────────────
class MarketSimulator {
    std::mt19937 rng_;
    std::normal_distribution<> noise_{0.0, 1.0};
    double price_;
    double tick_size_;
    double volatility_;
    double mean_;
    double mean_rev_strength_;
public:
    MarketSimulator(double start = 5250.0, double tick = 0.25, double vol = 1.1,
                    double mean_rev = 0.001, uint32_t seed = 42)
        : rng_(seed), price_(start), tick_size_(tick), volatility_(vol),
          mean_(start), mean_rev_strength_(mean_rev) {}

    Bar next_bar(int idx) {
        // Generate 20 ticks per bar (simulate 5-second bar)
        double open = price_;
        double high = price_, low = price_;
        double vol = 100 + std::abs(noise_(rng_)) * 200; // volume

        for (int i = 0; i < 20; ++i) {
            double drift = mean_rev_strength_ * (mean_ - price_);
            double shock = volatility_ * noise_(rng_) * tick_size_;
            price_ += drift + shock;
            // Snap to tick
            price_ = std::round(price_ / tick_size_) * tick_size_;
            high = std::max(high, price_);
            low  = std::min(low, price_);
        }

        double close = price_;
        double vwap = (high + low + close) / 3.0; // simplified

        return {idx, open, high, low, close, vol, vwap};
    }
};

// ── ANSI Colors ─────────────────────────────────────────────────────────────
namespace clr {
    constexpr const char* RESET  = "\033[0m";
    constexpr const char* RED    = "\033[31m";
    constexpr const char* GREEN  = "\033[32m";
    constexpr const char* YELLOW = "\033[33m";
    constexpr const char* BLUE   = "\033[34m";
    constexpr const char* CYAN   = "\033[36m";
    constexpr const char* BOLD   = "\033[1m";
    constexpr const char* DIM    = "\033[2m";
}

// ── Trading Engine (Orchestrator) ───────────────────────────────────────────
class TradingEngine {
    SignalEngine   signal_;
    RiskManager    risk_;
    MarketSimulator market_;

    // Position state
    Side   pos_side_ = Side::NONE;
    double entry_price_ = 0;
    int    entry_bar_ = 0;
    double stop_price_ = 0;
    double target_price_ = 0;
    double max_favorable_ = 0;
    double trailing_pct_ = 0.5;

    // ES contract specs
    static constexpr double TICK_SIZE  = 0.25;
    static constexpr double TICK_VALUE = 12.50; // $12.50 per tick for ES
    static constexpr double POINT_VALUE = 50.0; // $50 per point for ES

    // Stats
    std::vector<Trade> trades_;
    double peak_pnl_ = 0;
    double max_drawdown_ = 0;

    // Data for JSON export
    struct BarData {
        int idx; double close, rsi, ema9, ema21, vwap, atr;
    };
    struct PnlPoint { int bar; double pnl; };
    std::vector<BarData> bar_history_;
    std::vector<PnlPoint> equity_curve_;

public:
    TradingEngine() : risk_(-500, -150, 50) {}

    void run(int num_bars, bool slow_mode) {
        print_header();
        bar_history_.reserve(num_bars);
        equity_curve_.reserve(100);

        for (int i = 1; i <= num_bars; ++i) {
            Bar bar = market_.next_bar(i);
            Signal sig = signal_.evaluate(bar);

            // Store bar data for JSON
            bar_history_.push_back({bar.index, bar.close, signal_.rsi(),
                signal_.ema9(), signal_.ema21(), signal_.vwap_val(), signal_.atr_val()});

            // Print bar info every 10 bars (or on signal/trade)
            bool has_signal = sig.action != TradeAction::NONE;
            bool has_exit = false;
            std::string exit_reason;

            // Check position management first
            if (pos_side_ != Side::NONE) {
                auto [should_exit, reason] = check_exit(bar);
                if (should_exit) {
                    has_exit = true;
                    exit_reason = reason;
                    close_position(bar, reason);
                }
            }

            // Print bar
            if (i % 10 == 0 || has_signal || has_exit || i <= 5) {
                print_bar(bar, sig);
            }

            // Print exit
            if (has_exit) {
                const auto& t = trades_.back();
                std::printf("  %s>>> EXIT %s  @ %.2f | P&L: %s$%.2f%s (%s)%s\n",
                    clr::BOLD,
                    t.side == Side::LONG ? "LONG " : "SHORT",
                    t.exit_price,
                    t.pnl >= 0 ? clr::GREEN : clr::RED,
                    t.pnl, clr::RESET,
                    t.exit_reason.c_str(), clr::RESET);
            }

            // Try to enter new position
            if (pos_side_ == Side::NONE && has_signal && risk_.can_trade()) {
                open_position(bar, sig);
                std::printf("  %s>>> ENTRY %s @ %.2f | Stop: %.2f | Target: %.2f | Score: %.2f%s\n",
                    clr::BOLD,
                    sig.action == TradeAction::BUY ? "LONG " : "SHORT",
                    entry_price_, stop_price_, target_price_, sig.score, clr::RESET);
                std::printf("  %s    Reasons: %s%s\n", clr::DIM, sig.reasons.c_str(), clr::RESET);
            }

            // Check circuit breaker
            if (risk_.is_killed()) {
                std::printf("\n  %s!!! CIRCUIT BREAKER TRIGGERED — Trading stopped !!!%s\n", clr::RED, clr::RESET);
                break;
            }

            // Track drawdown
            double pnl = risk_.daily_pnl();
            if (pnl > peak_pnl_) peak_pnl_ = pnl;
            double dd = pnl - peak_pnl_;
            if (dd < max_drawdown_) max_drawdown_ = dd;

            // Equity curve point on each trade
            if (has_exit) equity_curve_.push_back({bar.index, risk_.daily_pnl()});

            if (slow_mode) std::this_thread::sleep_for(std::chrono::milliseconds(30));
        }

        // Flatten if still in position
        if (pos_side_ != Side::NONE) {
            Bar last = market_.next_bar(num_bars + 1);
            close_position(last, "EOD_FLATTEN");
            std::printf("  %s>>> FLATTEN EOD @ %.2f%s\n", clr::YELLOW, last.close, clr::RESET);
        }

        print_results();
        export_json("results.json");
    }

    void export_json(const char* path) {
        std::ofstream f(path);
        if (!f) return;

        // Stats
        int wins = 0, losses = 0;
        double gross_profit = 0, gross_loss = 0;
        for (const auto& t : trades_) {
            if (t.pnl >= 0) { ++wins; gross_profit += t.pnl; }
            else { ++losses; gross_loss += t.pnl; }
        }
        int total = (int)trades_.size();
        double net = gross_profit + gross_loss;
        double win_rate = total > 0 ? 100.0 * wins / total : 0;
        double pf = std::abs(gross_loss) > 0 ? gross_profit / std::abs(gross_loss) : 0;

        f << "{\n";
        // Stats
        f << "\"stats\":{";
        f << "\"trades\":" << total << ",\"wins\":" << wins << ",\"losses\":" << losses;
        f << ",\"win_rate\":" << std::fixed;
        f.precision(1); f << win_rate;
        f << ",\"net_pnl\":"; f.precision(2); f << net;
        f << ",\"gross_profit\":" << gross_profit;
        f << ",\"gross_loss\":" << gross_loss;
        f << ",\"profit_factor\":"; f.precision(2); f << pf;
        f << ",\"max_drawdown\":" << max_drawdown_;
        f << ",\"expectancy\":"; f << (total > 0 ? net / total : 0.0);
        f << "},\n";

        // Trades
        f << "\"trades\":[";
        for (size_t i = 0; i < trades_.size(); ++i) {
            const auto& t = trades_[i];
            if (i > 0) f << ",";
            f << "\n{\"entry_bar\":" << t.entry_bar;
            f << ",\"exit_bar\":" << t.exit_bar;
            f << ",\"side\":\"" << (t.side == Side::LONG ? "LONG" : "SHORT") << "\"";
            f << ",\"entry\":" << t.entry_price;
            f << ",\"exit\":" << t.exit_price;
            f << ",\"pnl\":" << t.pnl;
            f << ",\"reason\":\"" << t.exit_reason << "\"}";
        }
        f << "\n],\n";

        // Equity curve
        f << "\"equity\":[";
        for (size_t i = 0; i < equity_curve_.size(); ++i) {
            if (i > 0) f << ",";
            f << "[" << equity_curve_[i].bar << "," << equity_curve_[i].pnl << "]";
        }
        f << "],\n";

        // Price data (sample every 5 bars for chart)
        f << "\"bars\":[";
        bool first = true;
        for (size_t i = 0; i < bar_history_.size(); i += 3) {
            const auto& b = bar_history_[i];
            if (!first) f << ",";
            first = false;
            f << "\n[" << b.idx << "," << b.close << "," << b.rsi << ","
              << b.ema9 << "," << b.ema21 << "," << b.vwap << "," << b.atr << "]";
        }
        f << "\n]\n}\n";
        f.close();
        std::printf("  %sJSON exported:%s results.json\n", clr::CYAN, clr::RESET);
    }

private:
    void open_position(const Bar& bar, const Signal& sig) {
        double atr = signal_.atr_val();
        if (atr < TICK_SIZE) atr = 2.0; // fallback

        entry_price_ = bar.close;
        entry_bar_ = bar.index;
        max_favorable_ = 0;

        if (sig.action == TradeAction::BUY) {
            pos_side_ = Side::LONG;
            stop_price_   = entry_price_ - 1.5 * atr;  // Tighter stop
            target_price_ = entry_price_ + 3.0 * atr;  // 1:2 R:R
        } else {
            pos_side_ = Side::SHORT;
            stop_price_   = entry_price_ + 1.5 * atr;
            target_price_ = entry_price_ - 3.0 * atr;
        }
        // Snap to ticks
        stop_price_   = std::round(stop_price_ / TICK_SIZE) * TICK_SIZE;
        target_price_ = std::round(target_price_ / TICK_SIZE) * TICK_SIZE;
    }

    std::pair<bool, std::string> check_exit(const Bar& bar) {
        bool is_long = pos_side_ == Side::LONG;
        double current = bar.close;

        // P&L in ticks
        double pnl_ticks = is_long ? (current - entry_price_) / TICK_SIZE
                                   : (entry_price_ - current) / TICK_SIZE;

        if (pnl_ticks > max_favorable_) max_favorable_ = pnl_ticks;

        // Trailing stop: if gained > 8 ticks, trail at 50%
        if (max_favorable_ > 8.0) {
            double trail;
            if (is_long) {
                trail = entry_price_ + (max_favorable_ * trailing_pct_) * TICK_SIZE;
                if (trail > stop_price_) stop_price_ = trail;
            } else {
                trail = entry_price_ - (max_favorable_ * trailing_pct_) * TICK_SIZE;
                if (trail < stop_price_) stop_price_ = trail;
            }
        }

        // Stop hit
        if (is_long && current <= stop_price_) return {true, max_favorable_ > 6 ? "TRAILING_STOP" : "STOP_LOSS"};
        if (!is_long && current >= stop_price_) return {true, max_favorable_ > 6 ? "TRAILING_STOP" : "STOP_LOSS"};

        // Target hit
        if (is_long && current >= target_price_) return {true, "TAKE_PROFIT"};
        if (!is_long && current <= target_price_) return {true, "TAKE_PROFIT"};

        // Max hold: 50 bars (~4 min)
        if (bar.index - entry_bar_ > 50) return {true, "MAX_HOLD"};

        return {false, ""};
    }

    void close_position(const Bar& bar, const std::string& reason) {
        double pnl_points = pos_side_ == Side::LONG
            ? bar.close - entry_price_
            : entry_price_ - bar.close;
        double pnl_dollars = pnl_points * POINT_VALUE;

        // Subtract commission ($1.70 round trip)
        pnl_dollars -= 1.70;

        trades_.push_back({entry_bar_, bar.index, pos_side_, entry_price_, bar.close, pnl_dollars, reason});
        risk_.record(pnl_dollars);
        pos_side_ = Side::NONE;
    }

    void print_header() {
        std::printf("\n%s", clr::BOLD);
        std::printf("  ____                  _____           __\n");
        std::printf(" / __ \\__  ______ _____/ / __/_______ _/ /___\n");
        std::printf("/ / / / / / / __ `/ __  /\\__ \\/ ___/ __  / __ \\\n");
        std::printf("/ /_/ / /_/ / /_/ / /_/ /___/ / /__/ /_/ / /_/ /\n");
        std::printf("\\___\\_\\__,_/\\__,_/\\__,_//____/\\___/\\__,_/ .___/\n");
        std::printf("                                       /_/\n");
        std::printf("%s\n", clr::RESET);
        std::printf("  %sInstrument:%s ES (simulated)  %sBars:%s 5sec  %sMode:%s Paper\n",
            clr::CYAN, clr::RESET, clr::CYAN, clr::RESET, clr::CYAN, clr::RESET);
        std::printf("  %sRisk:%s Max loss $500/day | Stop 2xATR | Target 3xATR | Trail 50%%\n\n",
            clr::CYAN, clr::RESET);
        std::printf("  %s%-6s %10s %7s %9s %9s %9s %9s%s\n",
            clr::DIM, "Bar", "Price", "RSI", "EMA9", "EMA21", "VWAP", "ATR", clr::RESET);
        std::printf("  %s──────────────────────────────────────────────────────────────────%s\n",
            clr::DIM, clr::RESET);
    }

    void print_bar(const Bar& bar, const Signal& sig) {
        const char* sig_color = clr::RESET;
        const char* sig_char = " ";
        if (sig.action == TradeAction::BUY)  { sig_color = clr::GREEN; sig_char = "+"; }
        if (sig.action == TradeAction::SELL) { sig_color = clr::RED;   sig_char = "-"; }

        // RSI color
        const char* rsi_c = clr::RESET;
        if (signal_.rsi() < 30) rsi_c = clr::GREEN;
        if (signal_.rsi() > 70) rsi_c = clr::RED;

        std::printf("  %s[%04d]%s %10.2f %s%7.1f%s %9.2f %9.2f %9.2f %9.2f %s%s%s\n",
            clr::DIM, bar.index, clr::RESET,
            bar.close,
            rsi_c, signal_.rsi(), clr::RESET,
            signal_.ema9(), signal_.ema21(),
            signal_.vwap_val(), signal_.atr_val(),
            sig_color, sig_char, clr::RESET);
    }

    void print_results() {
        std::printf("\n  %s══════════════════════════════════════════════════════════════════%s\n", clr::BOLD, clr::RESET);
        std::printf("  %s                    RESULTATS DE SIMULATION%s\n", clr::BOLD, clr::RESET);
        std::printf("  %s══════════════════════════════════════════════════════════════════%s\n\n", clr::BOLD, clr::RESET);

        if (trades_.empty()) {
            std::printf("  Aucun trade execute.\n");
            return;
        }

        int wins = 0, losses = 0;
        double gross_profit = 0, gross_loss = 0;
        double best_trade = -1e9, worst_trade = 1e9;
        int stops = 0, targets = 0, trails = 0, max_holds = 0;

        for (const auto& t : trades_) {
            if (t.pnl >= 0) { ++wins; gross_profit += t.pnl; }
            else { ++losses; gross_loss += t.pnl; }
            best_trade = std::max(best_trade, t.pnl);
            worst_trade = std::min(worst_trade, t.pnl);
            if (t.exit_reason == "STOP_LOSS") ++stops;
            if (t.exit_reason == "TAKE_PROFIT") ++targets;
            if (t.exit_reason == "TRAILING_STOP") ++trails;
            if (t.exit_reason == "MAX_HOLD") ++max_holds;
        }

        int total = (int)trades_.size();
        double net = gross_profit + gross_loss;
        double win_rate = total > 0 ? 100.0 * wins / total : 0;
        double avg_win = wins > 0 ? gross_profit / wins : 0;
        double avg_loss = losses > 0 ? gross_loss / losses : 0;
        double pf = std::abs(gross_loss) > 0 ? gross_profit / std::abs(gross_loss) : 999;
        double expectancy = total > 0 ? net / total : 0;

        const char* net_c = net >= 0 ? clr::GREEN : clr::RED;

        std::printf("  %sTrades:%s       %d total | %s%d wins%s | %s%d losses%s\n",
            clr::CYAN, clr::RESET, total,
            clr::GREEN, wins, clr::RESET,
            clr::RED, losses, clr::RESET);
        std::printf("  %sWin Rate:%s     %.1f%%\n", clr::CYAN, clr::RESET, win_rate);
        std::printf("\n");
        std::printf("  %sGross Profit:%s %s$%.2f%s\n", clr::CYAN, clr::RESET, clr::GREEN, gross_profit, clr::RESET);
        std::printf("  %sGross Loss:%s   %s$%.2f%s\n", clr::CYAN, clr::RESET, clr::RED, gross_loss, clr::RESET);
        std::printf("  %s────────────────────────────────%s\n", clr::DIM, clr::RESET);
        std::printf("  %sNet P&L:%s      %s%s$%.2f%s\n",
            clr::BOLD, clr::RESET, clr::BOLD, net_c, net, clr::RESET);
        std::printf("\n");
        std::printf("  %sProfit Factor:%s %.2f\n", clr::CYAN, clr::RESET, pf);
        std::printf("  %sExpectancy:%s   $%.2f / trade\n", clr::CYAN, clr::RESET, expectancy);
        std::printf("  %sMax Drawdown:%s %s$%.2f%s\n", clr::CYAN, clr::RESET, clr::RED, max_drawdown_, clr::RESET);
        std::printf("\n");
        std::printf("  %sAvg Win:%s      $%.2f\n", clr::CYAN, clr::RESET, avg_win);
        std::printf("  %sAvg Loss:%s     $%.2f\n", clr::CYAN, clr::RESET, avg_loss);
        std::printf("  %sBest Trade:%s   %s$%.2f%s\n", clr::CYAN, clr::RESET, clr::GREEN, best_trade, clr::RESET);
        std::printf("  %sWorst Trade:%s  %s$%.2f%s\n", clr::CYAN, clr::RESET, clr::RED, worst_trade, clr::RESET);
        std::printf("\n");
        std::printf("  %sExit Types:%s   Stop: %d | Target: %d | Trail: %d | MaxHold: %d\n",
            clr::CYAN, clr::RESET, stops, targets, trails, max_holds);

        std::printf("\n  %s══════════════════════════════════════════════════════════════════%s\n", clr::BOLD, clr::RESET);

        // Verdict
        if (net > 0 && pf > 1.2 && win_rate > 45) {
            std::printf("  %s%s  STRATEGIE VIABLE — Pret pour Phase 2 (IB Gateway + CME)%s\n",
                clr::BOLD, clr::GREEN, clr::RESET);
        } else if (net > 0) {
            std::printf("  %s%s  STRATEGIE OK — Optimisation des parametres recommandee%s\n",
                clr::BOLD, clr::YELLOW, clr::RESET);
        } else {
            std::printf("  %s%s  STRATEGIE A REVOIR — Ajuster les indicateurs/risk%s\n",
                clr::BOLD, clr::RED, clr::RESET);
        }
        std::printf("\n");
    }
};

// ── Main ────────────────────────────────────────────────────────────────────
int main(int argc, char* argv[]) {
    int num_bars = 1000;
    bool slow = false;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--slow") slow = true;
        if (arg == "--bars" && i + 1 < argc) num_bars = std::stoi(argv[++i]);
    }

    auto t0 = std::chrono::high_resolution_clock::now();

    TradingEngine engine;
    engine.run(num_bars, slow);

    auto t1 = std::chrono::high_resolution_clock::now();
    double ms = std::chrono::duration<double, std::milli>(t1 - t0).count();

    std::printf("  %sExecution:%s %.1f ms (%d bars, %.0f bars/sec)\n\n",
        clr::DIM, clr::RESET, ms, num_bars, num_bars / (ms / 1000.0));

    return 0;
}
