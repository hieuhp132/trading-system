import { AppError } from "../../common/errors/app-error.js";
import { db } from "../../database/prisma.js";
import type { CreateOrderInput } from "./schema.js";
import type {
  CreateOrderResponse,
  OrderExecutionPositionResponse,
  OrderExecutionResponse,
  OrdersListResponse,
  PortfolioSummaryResponse,
  PositionResponse,
  PositionsListResponse,
  TradeResponse,
  TradesListResponse,
  OrderType,
} from "./types.js";
import { calculateUnrealizedPnl, roundMoney } from "../../common/utils/pnl.js";
import { calculateRequiredMargin } from "../../common/utils/margin.js";
import { calculateAccountMarginRisk } from "./margin-risk.js";
import { assertTradingExecutionAllowed, getMarketPrice, getTradingQuote } from "../market/service.js";
import { XAUUSD_SPEC } from "../../common/constants/xauusd.js";
import type { UpdatePositionStopsInput } from "./schema.js";
import { validateStopLevels } from "./stop-levels.js";
import { evaluateStopTrigger } from "./stop-trigger.js";
import type { MarketPriceResponse } from "../market/types.js";
import { evaluateLimitTrigger } from "./limit-trigger.js";
import { isMarketClosedByWeekend } from "../market/market-hours.js";

const ZERO = "0";

async function lockDemoAccount(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  accountId: string,
): Promise<void> {
  const plan = db.raw.sql`
    SELECT "id"
    FROM "public"."demoAccount"
    WHERE "id" = ${accountId}
    FOR UPDATE
  `
    .returnsRow({
      id: { codecId: "pg/text@1" },
    })
    .build();

  const rows = await tx.query(plan);

  if (rows.length !== 1) {
    throw new AppError(
      "Không tìm thấy demo account",
      404,
      "DEMO_ACCOUNT_NOT_FOUND",
    );
  }
}

function toNumber(value: unknown): number {
  return Number(value);
}

function validateOrderVolume(quantity: number): void {
  const { minVolume, maxVolume, volumeStep } = XAUUSD_SPEC;

  if (
    !Number.isFinite(quantity) ||
    quantity < minVolume ||
    quantity > maxVolume
  ) {
    throw new AppError(
      `Volume phải nằm trong khoảng ${minVolume} đến ${maxVolume} lots`,
      400,
      "INVALID_ORDER_VOLUME",
    );
  }

  const steps = quantity / volumeStep;

  if (Math.abs(steps - Math.round(steps)) > 1e-8) {
    throw new AppError(
      `Volume phải là bội số của ${volumeStep} lots`,
      400,
      "INVALID_VOLUME_STEP",
    );
  }
}


/*
 * Market price của MVP XAUUSD sử dụng 2 decimal places.
 *
 * Quan trọng:
 * Không dùng String(number) trực tiếp cho price vì JavaScript
 * có thể sinh floating-point artifact:
 *
 * 3651.2
 * 3651.2000000000003
 * 3651.4000000000005
 *
 * => luôn normalize price về 2 chữ số.
 */
function formatPrice(value: number): string {
  return value.toFixed(2);
}

/*
 * Money / P&L của MVP cũng hiển thị 2 decimal places.
 */
function formatDecimal(value: number): string {
  return value.toFixed(2);
}

function calculatePnl(
  side: "LONG" | "SHORT",
  entryPrice: number,
  currentPrice: number,
  quantity: number,
): number {
  return calculateUnrealizedPnl(side, quantity, entryPrice, currentPrice);
}

function toOrderResponse(order: {
  id: string;
  accountId: string;
  symbol: string;
  side: "BUY" | "SELL";
  orderType: OrderType;
  quantity: unknown;
  requestedPrice: unknown;
  executedPrice: unknown;
  stopLoss: unknown;
  takeProfit: unknown;
  status: "PENDING" | "FILLED" | "REJECTED" | "CANCELLED";
  commission: unknown;
  createdAt: string;
  executedAt: string | null;
}, realizedPnl: string | null = null): CreateOrderResponse {
  return {
    id: order.id,
    accountId: order.accountId,
    symbol: order.symbol,
    side: order.side,
    orderType: order.orderType,
    quantity: String(order.quantity),
    requestedPrice:
      order.requestedPrice === null
        ? null
        : formatPrice(Number(order.requestedPrice)),
    executedPrice:
      order.executedPrice === null
        ? null
        : formatPrice(Number(order.executedPrice)),
    status: order.status,
    commission: String(order.commission),
    realizedPnl,
    createdAt: order.createdAt,
    executedAt: order.executedAt,
    stopLoss: order.stopLoss === null ? null : String(order.stopLoss),
    takeProfit: order.takeProfit === null ? null : String(order.takeProfit),
  };
}

function toPositionResponse(position: {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  quantity: unknown;
  averageEntryPrice: unknown;
  currentPrice: unknown;
  unrealizedPnl: unknown;
  status: "OPEN" | "CLOSED";
  stopLoss: unknown;
  takeProfit: unknown;
}) {
  if (position.currentPrice === null) {
    throw new AppError(
      "Position không có current price",
      500,
      "POSITION_CURRENT_PRICE_MISSING",
    );
  }

  return {
    id: position.id,
    symbol: position.symbol,
    side: position.side,
    quantity: String(position.quantity),
    averageEntryPrice: formatPrice(Number(position.averageEntryPrice)),
    currentPrice: formatPrice(Number(position.currentPrice)),
    unrealizedPnl: formatDecimal(Number(position.unrealizedPnl)),
    status: position.status,
    stopLoss: position.stopLoss == null ? null : String(position.stopLoss),
    takeProfit:
      position.takeProfit == null ? null : String(position.takeProfit),
  };
}

export async function createMarketOrder(
  userId: string,
  input: CreateOrderInput,
): Promise<OrderExecutionResponse> {
  if (input.orderType !== "MARKET") {
    throw new AppError(
      "Limit Order chưa được hỗ trợ ở giai đoạn này",
      400,
      "UNSUPPORTED_ORDER_TYPE",
    );
  }

  if (input.symbol !== XAUUSD_SPEC.symbol) {
    throw new AppError(
      "Chỉ hỗ trợ giao dịch XAUUSD",
      400,
      "UNSUPPORTED_SYMBOL",
    );
  }

  const quantity = toNumber(input.quantity);
  validateOrderVolume(quantity);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new AppError("Quantity phải lớn hơn 0", 400, "INVALID_QUANTITY");
  }

  const marketPrice = await getTradingQuote(input.symbol);

  /*
   * BUY  -> khớp tại ASK
   * SELL -> khớp tại BID
   */
  const executedPrice =
    input.side === "BUY" ? Number(marketPrice.ask) : Number(marketPrice.bid);

  if (!Number.isFinite(executedPrice) || executedPrice <= 0) {
    throw new AppError(
      "Market price không hợp lệ",
      500,
      "INVALID_MARKET_PRICE",
    );
  }

  /*
   * Normalize market price ngay sau khi lấy từ provider.
   *
   * Ví dụ:
   * 3651.2 -> 3651.20
   */
  const normalizedExecutedPrice = Number(formatPrice(executedPrice));

  const result = await db.transaction(async (tx) => {
    const accountRef = await tx.orm.public.DemoAccount.where({
      userId,
    }).first();

    if (!accountRef) {
      throw new AppError(
        "Không tìm thấy demo account",
        404,
        "DEMO_ACCOUNT_NOT_FOUND",
      );
    }

    // Phải khóa trước khi đọc balance và các OPEN positions.
    await lockDemoAccount(tx, accountRef.id);

    // Đọc lại dữ liệu sau khi lấy được khóa.
    const account = await tx.orm.public.DemoAccount.where({
      id: accountRef.id,
    }).first();

    if (!account) {
      throw new AppError(
        "Không tìm thấy demo account",
        404,
        "DEMO_ACCOUNT_NOT_FOUND",
      );
    }

    if (account.status !== "ACTIVE") {
      throw new AppError(
        "Tài khoản demo không hoạt động",
        400,
        "DEMO_ACCOUNT_NOT_ACTIVE",
      );
    }

    const leverage = Number(account.maxLeverage);
    const balance = Number(account.balance);

    if (!Number.isFinite(leverage) || leverage <= 0) {
      throw new AppError(
        "Leverage của tài khoản không hợp lệ",
        500,
        "INVALID_ACCOUNT_LEVERAGE",
      );
    }

    if (!Number.isFinite(balance)) {
      throw new AppError(
        "Balance của tài khoản không hợp lệ",
        500,
        "INVALID_ACCOUNT_BALANCE",
      );
    }

    const bid = Number(marketPrice.bid);
    const ask = Number(marketPrice.ask);

    if (
      !Number.isFinite(bid) ||
      !Number.isFinite(ask) ||
      bid <= 0 ||
      ask <= 0 ||
      bid > ask
    ) {
      throw new AppError("BID/ASK không hợp lệ", 502, "INVALID_MARKET_PRICE");
    }

    // Đọc tất cả position đang mở trước khi tạo lệnh.
    const currentOpenPositions = await tx.orm.public.Position.where({
      accountId: account.id,
      status: "OPEN",
    }).all();

    let currentUnrealizedPnl = 0;
    let usedMargin = 0;

    for (const position of currentOpenPositions) {
      const positionQuantity = Number(position.quantity);
      const entryPrice = Number(position.averageEntryPrice);

      if (
        !Number.isFinite(positionQuantity) ||
        positionQuantity <= 0 ||
        !Number.isFinite(entryPrice) ||
        entryPrice <= 0
      ) {
        throw new AppError(
          "Dữ liệu position không hợp lệ",
          500,
          "INVALID_POSITION_MARGIN_DATA",
        );
      }

      const currentPrice = position.side === "LONG" ? bid : ask;

      currentUnrealizedPnl += calculateUnrealizedPnl(
        position.side,
        positionQuantity,
        entryPrice,
        currentPrice,
      );

      usedMargin += calculateRequiredMargin(
        positionQuantity,
        entryPrice,
        leverage,
      );
    }

    const equity = balance + currentUnrealizedPnl;
    const freeMargin = equity - usedMargin;

    const requiredMargin = calculateRequiredMargin(
      quantity,
      normalizedExecutedPrice,
      leverage,
    );

    if (
      !Number.isFinite(equity) ||
      !Number.isFinite(freeMargin) ||
      !Number.isFinite(requiredMargin)
    ) {
      throw new AppError(
        "Kết quả tính margin không hợp lệ",
        500,
        "INVALID_MARGIN_CALCULATION",
      );
    }

    // So sánh ở độ chính xác tiền tệ 2 chữ số,
    // tránh từ chối sai vì sai số floating-point rất nhỏ.
    const availableMarginCents = Math.round(freeMargin * 100);
    const requiredMarginCents = Math.ceil(requiredMargin * 100 - 1e-8);

    if (requiredMarginCents > availableMarginCents) {
      throw new AppError(
        "Không đủ free margin để mở lệnh",
        400,
        "INSUFFICIENT_MARGIN",
        {
          equity: roundMoney(equity),
          usedMargin: roundMoney(usedMargin),
          freeMargin: roundMoney(freeMargin),
          requiredMargin: roundMoney(requiredMargin),
        },
      );
    }

    /*
     * ============================================================
     * POSITION SEMANTICS
     * ============================================================
     *
     * BUY  -> LONG
     * SELL -> SHORT
     *
     * BUY KHÔNG đóng SHORT.
     * SELL KHÔNG đóng LONG.
     *
     * Position chỉ được đóng bằng:
     *
     * POST /orders/positions/:id/close
     *
     * ============================================================
     */

    const positionSide = input.side === "BUY" ? "LONG" : "SHORT";

    validateStopLevels(
      positionSide,
      bid,
      ask,
      input.stopLoss,
      input.takeProfit,
    );

    /*
     * ============================================================
     * CREATE ORDER
     * ============================================================
     *
     * MARKET order được fill ngay lập tức.
     *
     * createdAt và executedAt dùng cùng một timestamp.
     */
    const now = new Date().toISOString();

    const order = await tx.orm.public.Order.create({
      accountId: account.id,
      symbol: input.symbol,
      side: input.side,
      orderType: "MARKET",
      quantity: input.quantity,
      requestedPrice: formatPrice(normalizedExecutedPrice),
      executedPrice: formatPrice(normalizedExecutedPrice),
      stopLoss: input.stopLoss ?? null,
      takeProfit: input.takeProfit ?? null,
      status: "FILLED",
      commission: ZERO,
      createdAt: now,
      executedAt: now,
    });

    /*
     * Opening / increasing position không tạo realized P&L.
     *
     * Realized P&L chỉ xuất hiện khi CLOSE position.
     */
    const realizedPnl = 0;

    let responsePosition: OrderExecutionPositionResponse | null = null;

    const newPosition = await tx.orm.public.Position.create({
      accountId: account.id,
      symbol: input.symbol,
      side: positionSide,
      quantity: input.quantity,
      averageEntryPrice: formatPrice(normalizedExecutedPrice),
      currentPrice: formatPrice(normalizedExecutedPrice),
      unrealizedPnl: ZERO,
      stopLoss: input.stopLoss ?? null,
      takeProfit: input.takeProfit ?? null,
      status: "OPEN",
    });

    await tx.orm.public.Trade.create({
      accountId: account.id,
      orderId: order.id,
      positionId: newPosition.id,
      symbol: input.symbol,
      side: input.side,
      quantity: input.quantity,
      entryPrice: formatPrice(normalizedExecutedPrice),
      exitPrice: null,
      realizedPnl: null,
      commission: ZERO,
    });

    responsePosition = toPositionResponse(newPosition);

    /*
     * ============================================================
     * UPDATE ACCOUNT
     * ============================================================
     *
     * BUY / SELL mở hoặc tăng position:
     *
     * balance KHÔNG thay đổi bởi realized P&L.
     *
     * equity =
     * balance + total unrealized P&L
     */
    const currentBalance = toNumber(account.balance);

    const newBalance = currentBalance + realizedPnl;

    /*
     * Lấy tất cả OPEN positions của account.
     */
    const openPositions = await tx.orm.public.Position.where({
      accountId: account.id,
      status: "OPEN",
    }).all();

    /*
     * Tổng unrealized P&L.
     */
    const totalUnrealizedPnl = openPositions.reduce(
      (total, position) => total + toNumber(position.unrealizedPnl),
      0,
    );

    const newEquity = newBalance + totalUnrealizedPnl;

    await tx.orm.public.DemoAccount.where({
      id: account.id,
    }).update({
      balance: formatDecimal(newBalance),
      equity: formatDecimal(newEquity),
    });

    /*
     * ============================================================
     * RESPONSE
     * ============================================================
     */
    return {
      order: {
        id: order.id,
        accountId: order.accountId,
        symbol: order.symbol,
        side: order.side,
        orderType: order.orderType,
        quantity: order.quantity,
        requestedPrice: order.requestedPrice,
        executedPrice: order.executedPrice,
        stopLoss: order.stopLoss == null ? null : String(order.stopLoss),
        takeProfit: order.takeProfit == null ? null : String(order.takeProfit),
        status: order.status,
        commission: order.commission,
        realizedPnl: null,
        createdAt: order.createdAt,
        executedAt: order.executedAt,
      },

      account: {
        accountId: account.id,
        accountNumber: account.accountNumber,
        balance: formatDecimal(newBalance),
        equity: formatDecimal(newEquity),
        unrealizedPnl: formatDecimal(totalUnrealizedPnl),
      },

      position: responsePosition,

      realizedPnl: formatDecimal(realizedPnl),
    };
  });

  return result;
}

function getRealizedPnl(trades: { realizedPnl: unknown }[]): string | null {
  const realizedTrades = trades.filter((trade) => trade.realizedPnl != null);

  if (realizedTrades.length === 0) {
    return null;
  }

  const total = realizedTrades.reduce(
    (sum, trade) => sum + Number(trade.realizedPnl),
    0,
  );

  return formatDecimal(total);
}

function assertUpdated<T>(value: T | null, message: string, code: string): T {
  if (!value) {
    throw new AppError(message, 500, code);
  }

  return value;
}

export async function getMyOrders(userId: string): Promise<OrdersListResponse> {
  const account = await db.orm.public.DemoAccount.where({
    userId,
  }).first();

  if (!account) {
    throw new AppError(
      "Tài khoản demo không tồn tại",
      404,
      "DEMO_ACCOUNT_NOT_FOUND",
    );
  }

  const orders = await db.orm.public.Order.where({
    accountId: account.id,
  }).all();
  const trades = await db.orm.public.Trade.where({
    accountId: account.id,
  }).all();
  const realizedPnlByOrderId = new Map<string, number>();

  for (const trade of trades) {
    if (trade.realizedPnl == null) {
      continue;
    }

    realizedPnlByOrderId.set(
      trade.orderId,
      (realizedPnlByOrderId.get(trade.orderId) ?? 0) +
        Number(trade.realizedPnl),
    );
  }

  const items = orders
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .map((order) => {
      const realizedPnl = realizedPnlByOrderId.get(order.id);
      return toOrderResponse(
        order,
        realizedPnl === undefined ? null : formatDecimal(realizedPnl),
      );
    });

  return {
    items,
    total: items.length,
  };
}

export async function getMyOrder(
  userId: string,
  orderId: string,
): Promise<CreateOrderResponse> {
  const account = await db.orm.public.DemoAccount.where({
    userId,
  }).first();

  if (!account) {
    throw new AppError(
      "Tài khoản demo không tồn tại",
      404,
      "DEMO_ACCOUNT_NOT_FOUND",
    );
  }

  const order = await db.orm.public.Order.where({
    id: orderId,
    accountId: account.id,
  }).first();

  if (!order) {
    throw new AppError("Order không tồn tại", 404, "ORDER_NOT_FOUND");
  }

  const trades = await db.orm.public.Trade.where({
    accountId: account.id,
    orderId: order.id,
  }).all();

  return toOrderResponse(order, getRealizedPnl(trades));
}

function resolveFixedPositionCurrentPrice(
  position: {
    side: "LONG" | "SHORT";
    currentPrice: unknown;
    averageEntryPrice: unknown;
  },
  marketPrice: MarketPriceResponse | null,
): number {
  if (marketPrice) {
    return position.side === "LONG"
      ? Number(marketPrice.bid)
      : Number(marketPrice.ask);
  }

  const fallbackPrice =
    position.currentPrice == null
      ? Number(position.averageEntryPrice)
      : Number(position.currentPrice);

  return Number.isFinite(fallbackPrice) && fallbackPrice > 0
    ? fallbackPrice
    : Number(position.averageEntryPrice);
}

function toPositionListResponse(position: {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  quantity: unknown;
  averageEntryPrice: unknown;
  currentPrice: unknown;
  unrealizedPnl: unknown;
  stopLoss: unknown;
  takeProfit: unknown;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
}, marketPrice: MarketPriceResponse | null = null): PositionResponse {
  const currentPrice = resolveFixedPositionCurrentPrice(position, marketPrice);

  return {
    id: position.id,
    symbol: position.symbol,
    side: position.side,
    quantity: String(position.quantity),
    averageEntryPrice: formatPrice(Number(position.averageEntryPrice)),
    currentPrice: formatPrice(currentPrice),
    unrealizedPnl: formatDecimal(Number(position.unrealizedPnl)),
    stopLoss: position.stopLoss == null ? null : String(position.stopLoss),
    takeProfit:
      position.takeProfit == null ? null : String(position.takeProfit),
    status: position.status,
    openedAt: position.openedAt,
    closedAt: position.closedAt,
  };
}

/*
 * Real-time version.
 */
export async function getMyPositions(
  userId: string,
): Promise<PositionsListResponse> {
  const account = await db.orm.public.DemoAccount.where({
    userId,
  }).first();

  if (!account) {
    throw new AppError(
      "Tài khoản demo không tồn tại",
      404,
      "DEMO_ACCOUNT_NOT_FOUND",
    );
  }

  const positions = await db.orm.public.Position.where({
    accountId: account.id,
  }).all();

  const marketPrice = await getMarketPrice(XAUUSD_SPEC.symbol);

  const items = positions
    .sort(
      (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
    )
    .map((position) => {
      const quantity = toNumber(position.quantity);
      const entryPrice = toNumber(position.averageEntryPrice);

      let currentPrice = resolveFixedPositionCurrentPrice(position, marketPrice);
      let unrealizedPnl = Number(position.unrealizedPnl ?? 0);

      if (Number.isFinite(currentPrice) && currentPrice > 0) {
        unrealizedPnl =
          position.status === "OPEN"
            ? calculatePnl(position.side, entryPrice, currentPrice, quantity)
            : 0;
      }

      return {
        id: position.id,
        symbol: position.symbol,
        side: position.side,
        quantity: String(position.quantity),
        averageEntryPrice: formatPrice(entryPrice),
        currentPrice: formatPrice(currentPrice),
        unrealizedPnl: formatDecimal(unrealizedPnl),
        stopLoss: position.stopLoss == null ? null : String(position.stopLoss),
        takeProfit:
          position.takeProfit == null ? null : String(position.takeProfit),
        status: position.status,
        openedAt: position.openedAt,
        closedAt: position.closedAt,
      };
    });

  return {
    items,
    total: items.length,
  };
}

export async function getMyPosition(
  userId: string,
  positionId: string,
): Promise<PositionResponse> {
  const account = await db.orm.public.DemoAccount.where({
    userId,
  }).first();

  if (!account) {
    throw new AppError(
      "Tài khoản demo không tồn tại",
      404,
      "DEMO_ACCOUNT_NOT_FOUND",
    );
  }

  const position = await db.orm.public.Position.where({
    id: positionId,
    accountId: account.id,
  }).first();

  if (!position) {
    throw new AppError("Position không tồn tại", 404, "POSITION_NOT_FOUND");
  }

  const marketPrice = await getMarketPrice(XAUUSD_SPEC.symbol);

  return toPositionListResponse(position, marketPrice);
}

function toTradeResponse(trade: {
  id: string;
  orderId: string;
  positionId: string | null;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: unknown;
  entryPrice: unknown;
  exitPrice: unknown;
  realizedPnl: unknown;
  commission: unknown;
  openedAt: string;
  closedAt: string | null;
}): TradeResponse {
  return {
    id: trade.id,
    orderId: trade.orderId,
    positionId: trade.positionId,
    symbol: trade.symbol,
    side: trade.side,
    quantity: String(trade.quantity),
    entryPrice:
      trade.entryPrice === null ? null : formatPrice(Number(trade.entryPrice)),
    exitPrice:
      trade.exitPrice === null ? null : formatPrice(Number(trade.exitPrice)),
    realizedPnl:
      trade.realizedPnl === null
        ? null
        : formatDecimal(Number(trade.realizedPnl)),
    commission: String(trade.commission),
    openedAt: trade.openedAt,
    closedAt: trade.closedAt,
  };
}

export async function getMyTrades(userId: string): Promise<TradesListResponse> {
  const account = await db.orm.public.DemoAccount.where({
    userId,
  }).first();

  if (!account) {
    throw new AppError(
      "Tài khoản demo không tồn tại",
      404,
      "DEMO_ACCOUNT_NOT_FOUND",
    );
  }

  const trades = await db.orm.public.Trade.where({
    accountId: account.id,
  }).all();

  const items = trades
    .sort(
      (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
    )
    .map(toTradeResponse);

  return {
    items,
    total: items.length,
  };
}

export async function getMyPortfolioSummary(
  userId: string,
): Promise<PortfolioSummaryResponse> {
  const account = await db.orm.public.DemoAccount.where({ userId }).first();

  if (!account) {
    throw new AppError(
      "Tài khoản demo không tồn tại",
      404,
      "DEMO_ACCOUNT_NOT_FOUND",
    );
  }

  const [positions, orders, trades, marketPrice] = await Promise.all([
    db.orm.public.Position.where({
      accountId: account.id,
      status: "OPEN",
    }).all(),

    db.orm.public.Order.where({
      accountId: account.id,
    }).all(),

    db.orm.public.Trade.where({
      accountId: account.id,
    }).all(),

    getMarketPrice(XAUUSD_SPEC.symbol),
  ]);

  /**
   * Calculate current position market value and unrealized PnL
   * using the latest market Bid/Ask.
   *
   * LONG  -> valued at BID
   * SHORT -> valued at ASK
   */
  const openPositions = positions
    .sort(
      (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
    )
    .map((position) => {
      const currentPrice =
        position.side === "LONG" ? marketPrice.bid : marketPrice.ask;

      const quantity = Number(position.quantity);

      const averageEntryPrice = Number(position.averageEntryPrice);

      const unrealizedPnl = calculateUnrealizedPnl(
        position.side,
        quantity,
        averageEntryPrice,
        Number(currentPrice),
      );

      return {
        id: position.id,
        symbol: position.symbol,
        side: position.side,

        quantity: String(position.quantity),

        averageEntryPrice: formatPrice(averageEntryPrice),

        currentPrice: formatPrice(Number(currentPrice)),

        unrealizedPnl: roundMoney(unrealizedPnl),

        status: position.status,
        openedAt: position.openedAt,
      };
    });

  const recentOrders = orders
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 10)
    .map((order) => toOrderResponse(order));

  /**
   * Total unrealized PnL of all currently open positions.
   */
  const unrealizedPnl = openPositions.reduce(
    (total, position) => total + Number(position.unrealizedPnl),
    0,
  );

  /**
   * Total realized PnL from closed trades.
   */
  const realizedPnl = trades.reduce(
    (total, trade) =>
      total + (trade.realizedPnl === null ? 0 : Number(trade.realizedPnl)),
    0,
  );

  const openOrders = orders.filter(
    (order) => order.status === "PENDING",
  ).length;

  /**
   * Equity is calculated from current market price:
   *
   * Equity = Balance + Unrealized PnL
   */
  const equity = Number(account.balance) + unrealizedPnl;

  return {
    account: {
      id: account.id,
      accountNumber: account.accountNumber,
      currency: account.currency,
    },

    balance: String(account.balance),

    equity: roundMoney(equity),

    realizedPnl: roundMoney(realizedPnl),

    unrealizedPnl: roundMoney(unrealizedPnl),

    openPositions: openPositions.length,

    openOrders,

    positions: openPositions,

    recentOrders,
  };
}

type AutomaticCloseMode = "STOP_LEVEL" | "STOP_OUT";

interface AutomaticCloseOptions {
  mode: AutomaticCloseMode;
  quote: MarketPriceResponse;
}

function validateAutomaticQuoteFreshness(
  quote: MarketPriceResponse,
  maxAgeMs = Number(
    process.env.STOP_OUT_WORKER_MAX_QUOTE_AGE_MS ?? 30_000,
  ),
): void {
  if (!Number.isInteger(maxAgeMs) || maxAgeMs < 100) {
    throw new AppError(
      "Cấu hình thời hạn market quote không hợp lệ",
      500,
      "INVALID_STOP_QUOTE_MAX_AGE",
    );
  }

  const quoteWithMaybeReceivedAt = quote as MarketPriceResponse & {
    receivedAt?: string;
  };
  const freshnessRaw =
    quoteWithMaybeReceivedAt.receivedAt ?? quote.timestamp;
  const freshnessTs = Date.parse(freshnessRaw);
  const now = Date.now();

  if (
    !Number.isFinite(freshnessTs) ||
    freshnessTs > now + 1000 ||
    now - freshnessTs > maxAgeMs
  ) {
    throw new AppError(
      "Market quote đã hết hạn hoặc timestamp không hợp lệ",
      502,
      "STALE_MARKET_QUOTE",
    );
  }
}

async function closePositionInternal(
  userId: string,
  positionId: string,
  requestedQuantity?: string,
  automatic?: AutomaticCloseOptions,
) {
  // The active provider, not a caller-supplied source label, controls execution.
  assertTradingExecutionAllowed();

  const marketPrice =
    automatic?.quote ?? (await getTradingQuote(XAUUSD_SPEC.symbol));

  if (automatic) {
    if (marketPrice.symbol !== XAUUSD_SPEC.symbol) {
      throw new AppError(
        "Market quote không đúng symbol",
        502,
        "INVALID_MARKET_SYMBOL",
      );
    }

    const bid = Number(marketPrice.bid);
    const ask = Number(marketPrice.ask);

    if (
      !Number.isFinite(bid) ||
      !Number.isFinite(ask) ||
      bid <= 0 ||
      bid > ask
    ) {
      throw new AppError(
        "Market quote không hợp lệ",
        502,
        "INVALID_MARKET_PRICE",
      );
    }
  }

  const result = await db.transaction(async (tx) => {
    const accountRef = await tx.orm.public.DemoAccount.where({
      userId,
    }).first();

    if (!accountRef) {
      throw new AppError(
        "Không tìm thấy demo account",
        404,
        "DEMO_ACCOUNT_NOT_FOUND",
      );
    }

    await lockDemoAccount(tx, accountRef.id);

    if (automatic) {
      validateAutomaticQuoteFreshness(marketPrice);
    }

    const account = await tx.orm.public.DemoAccount.where({
      id: accountRef.id,
    }).first();

    if (!account) {
      throw new AppError(
        "Không tìm thấy demo account",
        404,
        "DEMO_ACCOUNT_NOT_FOUND",
      );
    }

    if (account.status !== "ACTIVE") {
      throw new AppError(
        "Tài khoản demo không hoạt động",
        400,
        "DEMO_ACCOUNT_NOT_ACTIVE",
      );
    }

    const position = await tx.orm.public.Position.where({
      id: positionId,
      accountId: account.id,
      status: "OPEN",
    }).first();

    if (!position) {
      if (automatic) {
        return null;
      }

      throw new AppError(
        "Position không tồn tại hoặc đã được đóng",
        404,
        "POSITION_NOT_FOUND",
      );
    }

    if (automatic?.mode === "STOP_LEVEL") {
      const trigger = evaluateStopTrigger(
        {
          side: position.side,
          stopLoss:
            position.stopLoss == null ? null : String(position.stopLoss),
          takeProfit:
            position.takeProfit == null ? null : String(position.takeProfit),
        },
        marketPrice,
      );

      if (!trigger.triggered) {
        return null;
      }
    }

    if (automatic?.mode === "STOP_OUT") {
      const openPositionsForRisk = await tx.orm.public.Position.where({
        accountId: account.id,
        status: "OPEN",
      }).all();

      const risk = calculateAccountMarginRisk(
        Number(account.balance),
        Number(account.maxLeverage),
        Number(account.marginCallLevel),
        Number(account.stopOutLevel),
        openPositionsForRisk.map((openPosition) => ({
          side: openPosition.side,
          quantity: Number(openPosition.quantity),
          entryPrice: Number(openPosition.averageEntryPrice),
        })),
        {
          bid: Number(marketPrice.bid),
          ask: Number(marketPrice.ask),
        },
      );

      if (risk.state !== "STOP_OUT") {
        return null;
      }
    }

    const quantity = toNumber(position.quantity);
    const entryPrice = toNumber(position.averageEntryPrice);
    const closeQuantity =
      requestedQuantity === undefined ? quantity : Number(requestedQuantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new AppError(
        "Position quantity không hợp lệ",
        500,
        "INVALID_POSITION_QUANTITY",
      );
    }

    validateOrderVolume(closeQuantity);

    const volumeStep = XAUUSD_SPEC.volumeStep;
    const currentSteps = Math.round(quantity / volumeStep);
    const closeSteps = Math.round(closeQuantity / volumeStep);

    if (closeSteps > currentSteps) {
      throw new AppError(
        "Khối lượng đóng vượt quá khối lượng Position",
        400,
        "CLOSE_QUANTITY_EXCEEDED",
      );
    }

    const remainingSteps = currentSteps - closeSteps;
    const remainingQuantity = Number((remainingSteps * volumeStep).toFixed(8));
    const isFullClose = remainingSteps === 0;
    const closeSide = position.side === "LONG" ? "SELL" : "BUY";
    const closePrice =
      position.side === "LONG"
        ? Number(marketPrice.bid)
        : Number(marketPrice.ask);

    if (!Number.isFinite(closePrice) || closePrice <= 0) {
      throw new AppError(
        "Giá đóng position không hợp lệ",
        502,
        "INVALID_CLOSE_PRICE",
      );
    }

    const normalizedClosePrice = Number(formatPrice(closePrice));

    const realizedPnl = calculatePnl(
      position.side,
      entryPrice,
      normalizedClosePrice,
      closeQuantity,
    );

    const now = new Date().toISOString();

    /**
     * Atomic state transition.
     *
     * Chỉ request đầu tiên được phép chuyển
     * Position từ OPEN sang CLOSED.
     */

    const remainingUnrealizedPnl = isFullClose
      ? 0
      : calculatePnl(
          position.side,
          entryPrice,
          normalizedClosePrice,
          remainingQuantity,
        );

    if (automatic) {
      validateAutomaticQuoteFreshness(marketPrice);
    }

    const updatedPosition = await tx.orm.public.Position.where({
      id: position.id,
      accountId: account.id,
      status: "OPEN",
      quantity: position.quantity,
    }).update({
      quantity: String(remainingQuantity),
      currentPrice: formatPrice(normalizedClosePrice),
      unrealizedPnl: formatDecimal(remainingUnrealizedPnl),
      status: isFullClose ? "CLOSED" : "OPEN",
      closedAt: isFullClose ? now : null,
    });

    if (!updatedPosition) {
      throw new AppError(
        "Position đã thay đổi hoặc đã được đóng",
        409,
        "POSITION_CONCURRENT_MODIFICATION",
      );
    }

    /**
     * Chỉ tạo closing Order sau khi
     * cập nhật Position thành công.
     */
    const order = await tx.orm.public.Order.create({
      accountId: account.id,
      symbol: position.symbol,
      side: closeSide,
      orderType: "MARKET",
      quantity: String(closeQuantity),
      requestedPrice: formatPrice(normalizedClosePrice),
      executedPrice: formatPrice(normalizedClosePrice),
      status: "FILLED",
      commission: ZERO,
      createdAt: now,
      executedAt: now,
    });

    /*
     * Ghi closing trade.
     */
    await tx.orm.public.Trade.create({
      accountId: account.id,
      orderId: order.id,
      positionId: position.id,
      symbol: position.symbol,
      side: closeSide,
      quantity: String(closeQuantity),
      entryPrice: formatPrice(entryPrice),
      exitPrice: formatPrice(normalizedClosePrice),
      realizedPnl: formatDecimal(realizedPnl),
      commission: ZERO,
      closedAt: now,
    });

    /*
     * Cập nhật balance.
     */
    const currentBalance = toNumber(account.balance);
    const newBalance = currentBalance + realizedPnl;

    /*
     * Các position còn OPEN.
     */
    const openPositions = await tx.orm.public.Position.where({
      accountId: account.id,
      status: "OPEN",
    }).all();

    /*
     * Tính unrealized PnL theo market price hiện tại.
     */
    const totalUnrealizedPnl = openPositions.reduce((total, openPosition) => {
      const currentPrice =
        openPosition.side === "LONG"
          ? Number(marketPrice.bid)
          : Number(marketPrice.ask);

      return (
        total +
        calculatePnl(
          openPosition.side,
          toNumber(openPosition.averageEntryPrice),
          currentPrice,
          toNumber(openPosition.quantity),
        )
      );
    }, 0);

    const newEquity = newBalance + totalUnrealizedPnl;

    const updatedAccount = assertUpdated(
      await tx.orm.public.DemoAccount.where({
        id: account.id,
      }).update({
        balance: formatDecimal(newBalance),
        equity: formatDecimal(newEquity),
      }),
      "Không thể cập nhật tài khoản",
      "ACCOUNT_UPDATE_FAILED",
    );

    return {
      order,
      position: updatedPosition,
      account: updatedAccount,
      realizedPnl,
      unrealizedPnl: totalUnrealizedPnl,
    };
  });

  if (result === null) {
    return null;
  }

  return {
    order: toOrderResponse(result.order),

    position: {
      id: result.position.id,
      symbol: result.position.symbol,
      side: result.position.side,
      quantity: String(result.position.quantity),
      averageEntryPrice: formatPrice(Number(result.position.averageEntryPrice)),
      currentPrice: formatPrice(Number(result.position.currentPrice)),
      unrealizedPnl: formatDecimal(Number(result.position.unrealizedPnl)),
      status: result.position.status,
    },

    account: {
      accountId: result.account.id,
      accountNumber: result.account.accountNumber,
      balance: formatDecimal(toNumber(result.account.balance)),
      equity: formatDecimal(toNumber(result.account.equity)),
      unrealizedPnl: formatDecimal(result.unrealizedPnl),
    },

    realizedPnl: formatDecimal(result.realizedPnl),
  };
}

/**
 * Manual Close:
 * Giữ nguyên API và hỗ trợ đóng một phần Position.
 */
export async function closePosition(
  userId: string,
  positionId: string,
  requestedQuantity?: string,
) {
  const result = await closePositionInternal(
    userId,
    positionId,
    requestedQuantity,
  );

  if (result === null) {
    throw new AppError(
      "Manual Close không trả về kết quả",
      500,
      "MANUAL_CLOSE_UNEXPECTED_RESULT",
    );
  }

  return result;
}

/**
 * Automatic SL/TP:
 * null = không còn điều kiện trigger sau khi khóa tài khoản.
 * Thành công = trả về kết quả đóng Position.
 *
 * Chưa trả reason cho đến khi reason được ghi nhận
 * trực tiếp trong transaction.
 */
export async function executeTriggeredStop(
  userId: string,
  positionId: string,
  quote: MarketPriceResponse,
) {
  return closePositionInternal(userId, positionId, undefined, {
    mode: "STOP_LEVEL",
    quote,
  });
}

/**
 * Automatic Stop Out:
 * null = account không còn ở STOP_OUT sau khi lấy account lock.
 * Thành công = forced-close toàn bộ Position được chọn.
 */
export async function executeStopOutPosition(
  userId: string,
  positionId: string,
  quote: MarketPriceResponse,
) {
  return closePositionInternal(userId, positionId, undefined, {
    mode: "STOP_OUT",
    quote,
  });
}

export async function updatePositionStops(
  userId: string,
  positionId: string,
  input: UpdatePositionStopsInput,
) {
  const marketPrice = await getTradingQuote(XAUUSD_SPEC.symbol);

  return db.transaction(async (tx) => {
    const accountRef = await tx.orm.public.DemoAccount.where({
      userId,
    }).first();

    if (!accountRef) {
      throw new AppError(
        "Không tìm thấy demo account",
        404,
        "DEMO_ACCOUNT_NOT_FOUND",
      );
    }

    await lockDemoAccount(tx, accountRef.id);

    const account = await tx.orm.public.DemoAccount.where({
      id: accountRef.id,
    }).first();

    if (!account || account.status !== "ACTIVE") {
      throw new AppError(
        "Demo account không hoạt động",
        400,
        "DEMO_ACCOUNT_NOT_ACTIVE",
      );
    }

    const position = await tx.orm.public.Position.where({
      id: positionId,
      accountId: account.id,
      status: "OPEN",
    }).first();

    if (!position) {
      throw new AppError(
        "Position không tồn tại hoặc đã đóng",
        404,
        "POSITION_NOT_FOUND",
      );
    }

    const stopLoss =
      input.stopLoss === undefined
        ? position.stopLoss === null
          ? null
          : String(position.stopLoss)
        : input.stopLoss;

    const takeProfit =
      input.takeProfit === undefined
        ? position.takeProfit === null
          ? null
          : String(position.takeProfit)
        : input.takeProfit;

    validateStopLevels(
      position.side,
      Number(marketPrice.bid),
      Number(marketPrice.ask),
      stopLoss,
      takeProfit,
    );

    const updated = await tx.orm.public.Position.where({
      id: position.id,
      accountId: account.id,
      status: "OPEN",
    }).update({
      stopLoss,
      takeProfit,
    });

    if (!updated) {
      throw new AppError(
        "Position đã thay đổi",
        409,
        "POSITION_CONCURRENT_MODIFICATION",
      );
    }

    return {
      id: updated.id,
      symbol: updated.symbol,
      side: updated.side,
      status: updated.status,
      stopLoss: updated.stopLoss === null ? null : String(updated.stopLoss),
      takeProfit:
        updated.takeProfit === null ? null : String(updated.takeProfit),
    };
  });
}

export async function createPendingLimitOrder(
  userId: string,
  input: CreateOrderInput,
): Promise<OrderExecutionResponse> {
  if (input.orderType !== "BUY_LIMIT" && input.orderType !== "SELL_LIMIT") {
    throw new AppError("Order type không hợp lệ", 400, "INVALID_ORDER_TYPE");
  }

  if (input.symbol !== XAUUSD_SPEC.symbol) {
    throw new AppError(
      "Chỉ hỗ trợ giao dịch XAUUSD",
      400,
      "UNSUPPORTED_SYMBOL",
    );
  }

  const quantity = Number(input.quantity);
  validateOrderVolume(quantity);

  if (
    !input.price ||
    !/^\d+(\.\d{1,2})?$/.test(input.price) ||
    !Number.isFinite(Number(input.price)) ||
    Number(input.price) <= 0
  ) {
    throw new AppError(
      "Limit price phải là số dương, tối đa 2 chữ số thập phân",
      400,
      "INVALID_LIMIT_PRICE",
    );
  }

  const limitPrice = Number(input.price);

  const quote = await getTradingQuote(input.symbol);
  const bid = Number(quote.bid);
  const ask = Number(quote.ask);

  if (
    !Number.isFinite(bid) ||
    !Number.isFinite(ask) ||
    bid <= 0 ||
    ask <= 0 ||
    bid > ask
  ) {
    throw new AppError("BID/ASK không hợp lệ", 502, "INVALID_MARKET_PRICE");
  }

  // Chính sách giai đoạn A:
  // Chỉ nhận Limit Order chưa đủ điều kiện khớp ngay.
  if (input.orderType === "BUY_LIMIT" && limitPrice >= ask) {
    throw new AppError(
      "BUY LIMIT phải thấp hơn giá ASK hiện tại",
      400,
      "INVALID_BUY_LIMIT_PRICE",
    );
  }

  if (input.orderType === "SELL_LIMIT" && limitPrice <= bid) {
    throw new AppError(
      "SELL LIMIT phải cao hơn giá BID hiện tại",
      400,
      "INVALID_SELL_LIMIT_PRICE",
    );
  }

  return db.transaction(async (tx) => {
    const accountRef = await tx.orm.public.DemoAccount.where({
      userId,
    }).first();

    if (!accountRef) {
      throw new AppError(
        "Không tìm thấy demo account",
        404,
        "DEMO_ACCOUNT_NOT_FOUND",
      );
    }

    await lockDemoAccount(tx, accountRef.id);

    const account = await tx.orm.public.DemoAccount.where({
      id: accountRef.id,
    }).first();

    if (!account) {
      throw new AppError(
        "Không tìm thấy demo account",
        404,
        "DEMO_ACCOUNT_NOT_FOUND",
      );
    }

    if (account.status !== "ACTIVE") {
      throw new AppError(
        "Tài khoản demo không hoạt động",
        400,
        "DEMO_ACCOUNT_NOT_ACTIVE",
      );
    }

    const balance = Number(account.balance);
    const equity = Number(account.equity);

    if (!Number.isFinite(balance) || !Number.isFinite(equity)) {
      throw new AppError(
        "Thông tin tài khoản không hợp lệ",
        500,
        "INVALID_ACCOUNT_BALANCE",
      );
    }

    const now = new Date().toISOString();

    const order = await tx.orm.public.Order.create({
      accountId: account.id,
      symbol: input.symbol,
      side: input.side,
      orderType: input.orderType,
      quantity: input.quantity,
      requestedPrice: formatPrice(limitPrice),
      executedPrice: null,
      stopLoss: input.stopLoss ?? null,
      takeProfit: input.takeProfit ?? null,
      status: "PENDING",
      commission: ZERO,
      createdAt: now,
      executedAt: null,
    });

    return {
      order: toOrderResponse(order),

      account: {
        accountId: account.id,
        accountNumber: account.accountNumber,
        balance: formatDecimal(balance),
        equity: formatDecimal(equity),
        unrealizedPnl: formatDecimal(equity - balance),
      },

      position: null,

      realizedPnl: ZERO,
    };
  });
}

/**
 * Execute an existing pending Limit Order.
 *
 * Returns null when:
 * - order is no longer PENDING; or
 * - the supplied quote no longer satisfies the limit.
 *
 * A failed validation rolls back the transaction.
 * The order remains PENDING if margin or stops are invalid.
 */
export async function cancelPendingLimitOrder(
  userId: string,
  orderId: string,
): Promise<CreateOrderResponse> {
  return db.transaction(async (tx) => {
    const accountRef = await tx.orm.public.DemoAccount.where({
      userId,
    }).first();

    if (!accountRef) {
      throw new AppError(
        "Không tìm thấy demo account",
        404,
        "DEMO_ACCOUNT_NOT_FOUND",
      );
    }

    // Dùng cùng khóa với Limit Worker.
    await lockDemoAccount(tx, accountRef.id);

    // Đọc lại order sau khi lấy khóa.
    const order = await tx.orm.public.Order.where({
      id: orderId,
      accountId: accountRef.id,
    }).first();

    if (!order) {
      throw new AppError(
        "Order không tồn tại",
        404,
        "ORDER_NOT_FOUND",
      );
    }

    if (
      order.orderType !== "BUY_LIMIT" &&
      order.orderType !== "SELL_LIMIT"
    ) {
      throw new AppError(
        "Chỉ có thể hủy Limit Order",
        400,
        "INVALID_ORDER_TYPE",
      );
    }

    if (order.status !== "PENDING") {
      throw new AppError(
        "Order không còn ở trạng thái PENDING",
        409,
        "ORDER_NOT_PENDING",
      );
    }

    // Atomic transition: PENDING -> CANCELLED.
    const cancelledOrder = await tx.orm.public.Order.where({
      id: order.id,
      accountId: accountRef.id,
      status: "PENDING",
    }).update({
      status: "CANCELLED",
    });

    if (!cancelledOrder) {
      throw new AppError(
        "Order đã thay đổi trạng thái",
        409,
        "ORDER_CONCURRENT_MODIFICATION",
      );
    }

    return toOrderResponse(cancelledOrder);
  });
}
export async function executePendingLimitOrder(
  userId: string,
  orderId: string,
  quote: MarketPriceResponse,
): Promise<OrderExecutionResponse | null> {
  // The active provider, not a caller-supplied source label, controls execution.
  assertTradingExecutionAllowed();

  // Defense in depth: also reject explicitly unverified supplied quotes.
  if (quote.source === "twelve-data") {
    throw new AppError(
      "Không thể xác minh thời điểm cập nhật giá Twelve Data tại nguồn",
      503,
      "TRADING_QUOTE_UNVERIFIED",
    );
  }

  const limitMaxQuoteAgeMs = Number(
    process.env.LIMIT_WORKER_MAX_QUOTE_AGE_MS ?? 5000,
  );

  if (quote.symbol !== XAUUSD_SPEC.symbol) {
    throw new AppError(
      "Market quote không đúng symbol",
      502,
      "INVALID_MARKET_SYMBOL",
    );
  }

  const bid = Number(quote.bid);
  const ask = Number(quote.ask);

  if (
    !Number.isFinite(bid) ||
    !Number.isFinite(ask) ||
    bid <= 0 ||
    ask <= 0 ||
    bid > ask
  ) {
    throw new AppError(
      "Market quote không hợp lệ",
      502,
      "INVALID_MARKET_PRICE",
    );
  }

  // Reject stale quotes before attempting to acquire a DB lock.
  validateAutomaticQuoteFreshness(quote, limitMaxQuoteAgeMs);

  return db.transaction(async (tx) => {
    const accountRef = await tx.orm.public.DemoAccount.where({
      userId,
    }).first();

    if (!accountRef) {
      throw new AppError(
        "Không tìm thấy demo account",
        404,
        "DEMO_ACCOUNT_NOT_FOUND",
      );
    }

    // All order execution paths must lock the same account first.
    await lockDemoAccount(tx, accountRef.id);

    // The quote may have expired while waiting for the lock.
    validateAutomaticQuoteFreshness(quote, limitMaxQuoteAgeMs);
    const account = await tx.orm.public.DemoAccount.where({
      id: accountRef.id,
    }).first();

    if (!account) {
      throw new AppError(
        "Không tìm thấy demo account",
        404,
        "DEMO_ACCOUNT_NOT_FOUND",
      );
    }

    if (account.status !== "ACTIVE") {
      throw new AppError(
        "Demo account không hoạt động",
        400,
        "DEMO_ACCOUNT_NOT_ACTIVE",
      );
    }

    // Read the order AFTER acquiring the account lock.
    const order = await tx.orm.public.Order.where({
      id: orderId,
      accountId: account.id,
    }).first();

    if (!order) {
      throw new AppError("Order không tồn tại", 404, "ORDER_NOT_FOUND");
    }

    // A second worker must not execute the same order again.
    if (order.status !== "PENDING") {
      return null;
    }

    if (order.orderType !== "BUY_LIMIT" && order.orderType !== "SELL_LIMIT") {
      throw new AppError(
        "Order không phải Limit Order",
        400,
        "INVALID_ORDER_TYPE",
      );
    }

    if (
      order.symbol !== XAUUSD_SPEC.symbol ||
      (order.orderType === "BUY_LIMIT" && order.side !== "BUY") ||
      (order.orderType === "SELL_LIMIT" && order.side !== "SELL")
    ) {
      throw new AppError(
        "Thông tin Limit Order không hợp lệ",
        500,
        "INVALID_PENDING_ORDER",
      );
    }

    if (order.requestedPrice == null) {
      throw new AppError(
        "Limit Order thiếu requestedPrice",
        500,
        "MISSING_LIMIT_PRICE",
      );
    }

    const trigger = evaluateLimitTrigger(
      {
        orderType: order.orderType,
        requestedPrice: String(order.requestedPrice),
      },
      quote,
    );

    if (!trigger.triggered || trigger.executionPrice === null) {
      return null;
    }

    const executionPrice = Number(trigger.executionPrice);
    const quantity = Number(order.quantity);

    validateOrderVolume(quantity);

    const leverage = Number(account.maxLeverage);
    const balance = Number(account.balance);

    if (!Number.isFinite(leverage) || leverage <= 0) {
      throw new AppError(
        "Leverage của tài khoản không hợp lệ",
        500,
        "INVALID_ACCOUNT_LEVERAGE",
      );
    }

    if (!Number.isFinite(balance)) {
      throw new AppError(
        "Balance không hợp lệ",
        500,
        "INVALID_ACCOUNT_BALANCE",
      );
    }

    const currentPositions = await tx.orm.public.Position.where({
      accountId: account.id,
      status: "OPEN",
    }).all();

    let currentUnrealizedPnl = 0;
    let usedMargin = 0;

    for (const position of currentPositions) {
      const positionQuantity = Number(position.quantity);
      const entryPrice = Number(position.averageEntryPrice);

      if (
        !Number.isFinite(positionQuantity) ||
        positionQuantity <= 0 ||
        !Number.isFinite(entryPrice) ||
        entryPrice <= 0
      ) {
        throw new AppError(
          "Dữ liệu position không hợp lệ",
          500,
          "INVALID_POSITION_MARGIN_DATA",
        );
      }

      const currentPrice = position.side === "LONG" ? bid : ask;

      currentUnrealizedPnl += calculatePnl(
        position.side,
        entryPrice,
        currentPrice,
        positionQuantity,
      );

      usedMargin += calculateRequiredMargin(
        positionQuantity,
        entryPrice,
        leverage,
      );
    }

    const equity = balance + currentUnrealizedPnl;
    const freeMargin = equity - usedMargin;

    const requiredMargin = calculateRequiredMargin(
      quantity,
      executionPrice,
      leverage,
    );

    if (
      !Number.isFinite(equity) ||
      !Number.isFinite(freeMargin) ||
      !Number.isFinite(requiredMargin)
    ) {
      throw new AppError(
        "Kết quả tính margin không hợp lệ",
        500,
        "INVALID_MARGIN_CALCULATION",
      );
    }

    const availableMarginCents = Math.round(freeMargin * 100);

    const requiredMarginCents = Math.ceil(requiredMargin * 100 - 1e-8);

    if (requiredMarginCents > availableMarginCents) {
      throw new AppError(
        "Không đủ free margin để khớp Limit Order",
        400,
        "INSUFFICIENT_MARGIN",
        {
          equity: roundMoney(equity),
          usedMargin: roundMoney(usedMargin),
          freeMargin: roundMoney(freeMargin),
          requiredMargin: roundMoney(requiredMargin),
        },
      );
    }

    const positionSide = order.side === "BUY" ? "LONG" : "SHORT";

    const stopLoss =
      order.stopLoss == null ? undefined : String(order.stopLoss);

    const takeProfit =
      order.takeProfit == null ? undefined : String(order.takeProfit);

    validateStopLevels(positionSide, bid, ask, stopLoss, takeProfit);

    // Check freshness again immediately before the first write.
    validateAutomaticQuoteFreshness(quote, limitMaxQuoteAgeMs);
    const now = new Date().toISOString();

    const filledOrder = assertUpdated(
      await tx.orm.public.Order.where({
        id: order.id,
        accountId: account.id,
        status: "PENDING",
      }).update({
        status: "FILLED",
        executedPrice: formatPrice(executionPrice),
        executedAt: now,
      }),
      "Không thể cập nhật Limit Order",
      "LIMIT_ORDER_UPDATE_FAILED",
    );

    const currentPrice = positionSide === "LONG" ? bid : ask;
    const unrealizedPnl = calculatePnl(
      positionSide,
      executionPrice,
      currentPrice,
      quantity,
    );

    const newPosition = await tx.orm.public.Position.create({
      accountId: account.id,
      symbol: order.symbol,
      side: positionSide,
      quantity: String(order.quantity),
      averageEntryPrice: formatPrice(executionPrice),
      currentPrice: formatPrice(currentPrice),
      unrealizedPnl: formatDecimal(unrealizedPnl),
      stopLoss: stopLoss ?? null,
      takeProfit: takeProfit ?? null,
      status: "OPEN",
    });

    await tx.orm.public.Trade.create({
      accountId: account.id,
      orderId: filledOrder.id,
      positionId: newPosition.id,
      symbol: order.symbol,
      side: order.side,
      quantity: String(order.quantity),
      entryPrice: formatPrice(executionPrice),
      exitPrice: null,
      realizedPnl: null,
      commission: ZERO,
    });

    const responsePosition = toPositionResponse(newPosition);

    // Revalue ALL open positions using the same quote.
    const openPositions = await tx.orm.public.Position.where({
      accountId: account.id,
      status: "OPEN",
    }).all();

    const totalUnrealizedPnl = openPositions.reduce((total, position) => {
      const currentPrice = position.side === "LONG" ? bid : ask;

      return (
        total +
        calculatePnl(
          position.side,
          Number(position.averageEntryPrice),
          currentPrice,
          Number(position.quantity),
        )
      );
    }, 0);

    const newEquity = balance + totalUnrealizedPnl;

    await tx.orm.public.DemoAccount.where({
      id: account.id,
    }).update({
      equity: formatDecimal(newEquity),
    });

    return {
      order: toOrderResponse(filledOrder),

      account: {
        accountId: account.id,
        accountNumber: account.accountNumber,
        balance: formatDecimal(balance),
        equity: formatDecimal(newEquity),
        unrealizedPnl: formatDecimal(totalUnrealizedPnl),
      },

      position: responsePosition,

      realizedPnl: formatDecimal(0),
    };
  });
}
