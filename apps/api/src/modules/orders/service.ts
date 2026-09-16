import { AppError } from "../../common/errors/app-error";
import { db } from "../../database/prisma";
import type { CreateOrderInput } from "./schema";
import type {
  CreateOrderResponse,
  OrderExecutionPositionResponse,
  OrderExecutionResponse,
  OrdersListResponse,
  PortfolioSummaryResponse,
  PortfolioSummaryPosition,
  PortfolioSummaryOrder,
  PositionResponse,
  PositionsListResponse,
  TradeResponse,
  TradesListResponse,
} from "./types";
import { calculateUnrealizedPnl, roundMoney } from "../../common/utils/pnl";
import { getMarketPrice } from "../market/service";

const SUPPORTED_SYMBOL = "XAUUSD";
const ZERO = "0";

function toNumber(value: unknown): number {
  return Number(value);
}

function formatDecimal(value: number): string {
  return value.toFixed(2);
}

function calculatePnl(
  side: "LONG" | "SHORT",
  entryPrice: number,
  currentPrice: number,
  quantity: number,
): number {
  if (side === "LONG") {
    return (currentPrice - entryPrice) * quantity;
  }

  return (entryPrice - currentPrice) * quantity;
}

function calculateWeightedAverage(
  currentQuantity: number,
  currentAverage: number,
  addedQuantity: number,
  addedPrice: number,
): number {
  const totalQuantity = currentQuantity + addedQuantity;

  if (totalQuantity === 0) {
    return 0;
  }

  return (
    (currentQuantity * currentAverage + addedQuantity * addedPrice) /
    totalQuantity
  );
}

function toOrderResponse(order: {
  id: string;
  accountId: string;
  symbol: string;
  side: "BUY" | "SELL";
  orderType: "MARKET";
  quantity: unknown;
  requestedPrice: unknown;
  executedPrice: unknown;
  status: "PENDING" | "FILLED" | "REJECTED" | "CANCELLED";
  commission: unknown;
  createdAt: string;
  executedAt: string | null;
}): CreateOrderResponse {
  return {
    id: order.id,
    accountId: order.accountId,
    symbol: order.symbol,
    side: order.side,
    orderType: order.orderType,
    quantity: String(order.quantity),
    requestedPrice:
      order.requestedPrice === null ? null : String(order.requestedPrice),
    executedPrice:
      order.executedPrice === null ? null : String(order.executedPrice),
    status: order.status,
    commission: String(order.commission),
    createdAt: order.createdAt,
    executedAt: order.executedAt,
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
    averageEntryPrice: String(position.averageEntryPrice),
    currentPrice: String(position.currentPrice),
    unrealizedPnl: String(position.unrealizedPnl),
    status: position.status,
  };
}

function assertUpdatedPosition<T>(position: T | null): T {
  if (!position) {
    throw new AppError(
      "Không thể cập nhật position",
      500,
      "POSITION_UPDATE_FAILED",
    );
  }

  return position;
}

export async function createMarketOrder(
  userId: string,
  input: CreateOrderInput,
): Promise<OrderExecutionResponse> {
  if (input.symbol !== SUPPORTED_SYMBOL) {
    throw new AppError(
      `Symbol ${input.symbol} chưa được hỗ trợ`,
      400,
      "UNSUPPORTED_SYMBOL",
    );
  }

  const quantity = toNumber(input.quantity);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new AppError("Quantity phải lớn hơn 0", 400, "INVALID_QUANTITY");
  }

  /*
   * Demo market price.
   *
   * BUY  -> Ask
   * SELL -> Bid
   *
   * Sau này chỉ cần thay đoạn này bằng MarketProvider.
   */
  const bid = 3650.2;
  const ask = 3650.4;

  const executedPrice = input.side === "BUY" ? ask : bid;

  const result = await db.transaction(async (tx) => {
    const account = await tx.orm.public.DemoAccount.where({ userId }).first();

    if (!account) {
      throw new AppError(
        "Tài khoản demo không tồn tại",
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

    const positionSide = input.side === "BUY" ? "LONG" : "SHORT";
    const oppositeSide = input.side === "BUY" ? "SHORT" : "LONG";

    const existingPosition = await tx.orm.public.Position.where({
      accountId: account.id,
      symbol: input.symbol,
      status: "OPEN",
      side: positionSide,
    }).first();

    const oppositePosition = await tx.orm.public.Position.where({
      accountId: account.id,
      symbol: input.symbol,
      status: "OPEN",
      side: oppositeSide,
    }).first();

    /*
     * MARKET order được fill ngay lập tức.
     */
    const order = await tx.orm.public.Order.create({
      accountId: account.id,
      symbol: input.symbol,
      side: input.side,
      orderType: "MARKET",
      quantity: input.quantity,
      requestedPrice: String(executedPrice),
      executedPrice: String(executedPrice),
      status: "FILLED",
      commission: ZERO,
      executedAt: new Date().toISOString(),
    });

    let realizedPnl = 0;

    let responsePosition: OrderExecutionPositionResponse | null = null;

    /*
     * ============================================================
     * CASE 1
     * Không có position đối ứng.
     *
     * BUY  -> mở / tăng LONG
     * SELL -> mở / tăng SHORT
     * ============================================================
     */
    if (!oppositePosition) {
      if (existingPosition) {
        const currentQuantity = toNumber(existingPosition.quantity);
        const currentAverage = toNumber(existingPosition.averageEntryPrice);

        const newQuantity = currentQuantity + quantity;

        const newAverage = calculateWeightedAverage(
          currentQuantity,
          currentAverage,
          quantity,
          executedPrice,
        );

        const unrealizedPnl = calculatePnl(
          positionSide,
          newAverage,
          executedPrice,
          newQuantity,
        );

        /*
         * Prisma 8 Contract ORM:
         *
         * KHÔNG dùng:
         * Position.update({ where, data })
         *
         * Mà dùng:
         * Position.where(...).update(...)
         */
        const updatedPosition = assertUpdatedPosition(
          await tx.orm.public.Position.where({
            id: existingPosition.id,
          }).update({
            quantity: String(newQuantity),
            averageEntryPrice: String(newAverage),
            currentPrice: String(executedPrice),
            unrealizedPnl: String(unrealizedPnl),
          }),
        );

        await tx.orm.public.Trade.create({
          accountId: account.id,
          orderId: order.id,
          positionId: updatedPosition.id,
          symbol: input.symbol,
          side: input.side,
          quantity: input.quantity,
          entryPrice: String(executedPrice),
          exitPrice: null,
          realizedPnl: null,
          commission: ZERO,
        });

        responsePosition = toPositionResponse(updatedPosition);
      } else {
        /*
         * Chưa có position cùng chiều
         * -> tạo position mới.
         */
        const newPosition = await tx.orm.public.Position.create({
          accountId: account.id,
          symbol: input.symbol,
          side: positionSide,
          quantity: input.quantity,
          averageEntryPrice: String(executedPrice),
          currentPrice: String(executedPrice),
          unrealizedPnl: ZERO,
          status: "OPEN",
        });

        await tx.orm.public.Trade.create({
          accountId: account.id,
          orderId: order.id,
          positionId: newPosition.id,
          symbol: input.symbol,
          side: input.side,
          quantity: input.quantity,
          entryPrice: String(executedPrice),
          exitPrice: null,
          realizedPnl: null,
          commission: ZERO,
        });

        responsePosition = toPositionResponse(newPosition);
      }
    } else {
      /*
       * ============================================================
       * CASE 2
       * Có position đối ứng.
       *
       * BUY  -> đóng / giảm SHORT
       * SELL -> đóng / giảm LONG
       * ============================================================
       */

      const oppositeQuantity = toNumber(oppositePosition.quantity);

      const closeQuantity = Math.min(quantity, oppositeQuantity);

      const remainingQuantity = oppositeQuantity - closeQuantity;

      const entryPrice = toNumber(oppositePosition.averageEntryPrice);

      realizedPnl = calculatePnl(
        oppositeSide,
        entryPrice,
        executedPrice,
        closeQuantity,
      );

      /*
       * Trade đóng position.
       */
      await tx.orm.public.Trade.create({
        accountId: account.id,
        orderId: order.id,
        positionId: oppositePosition.id,
        symbol: input.symbol,
        side: input.side,
        quantity: String(closeQuantity),
        entryPrice: String(entryPrice),
        exitPrice: String(executedPrice),
        realizedPnl: String(realizedPnl),
        commission: ZERO,
        closedAt: remainingQuantity === 0 ? new Date().toISOString() : null,
      });

      /*
       * Position đối ứng đã đóng hoàn toàn.
       */
      if (remainingQuantity === 0) {
        await tx.orm.public.Position.where({ id: oppositePosition.id }).update({
          quantity: ZERO,
          currentPrice: String(executedPrice),
          unrealizedPnl: ZERO,
          status: "CLOSED",
          closedAt: new Date().toISOString(),
        });

        responsePosition = null;
      } else {
        /*
         * Position đối ứng vẫn còn một phần.
         */
        const unrealizedPnl = calculatePnl(
          oppositeSide,
          entryPrice,
          executedPrice,
          remainingQuantity,
        );

        const updatedPosition = assertUpdatedPosition(
          await tx.orm.public.Position.where({
            id: oppositePosition.id,
          }).update({
            quantity: String(remainingQuantity),
            currentPrice: String(executedPrice),
            unrealizedPnl: String(unrealizedPnl),
          }),
        );

        responsePosition = toPositionResponse(updatedPosition);
      }

      /*
       * ============================================================
       * Nếu order lớn hơn position đối ứng:
       *
       * BUY 10
       * đang SHORT 6
       *
       * -> đóng SHORT 6
       * -> mở LONG 4
       * ============================================================
       */
      if (quantity > oppositeQuantity) {
        const remainingOrderQuantity = quantity - oppositeQuantity;

        const newPosition = await tx.orm.public.Position.create({
          accountId: account.id,
          symbol: input.symbol,
          side: positionSide,
          quantity: String(remainingOrderQuantity),
          averageEntryPrice: String(executedPrice),
          currentPrice: String(executedPrice),
          unrealizedPnl: ZERO,
          status: "OPEN",
        });

        await tx.orm.public.Trade.create({
          accountId: account.id,
          orderId: order.id,
          positionId: newPosition.id,
          symbol: input.symbol,
          side: input.side,
          quantity: String(remainingOrderQuantity),
          entryPrice: String(executedPrice),
          exitPrice: null,
          realizedPnl: null,
          commission: ZERO,
        });

        responsePosition = toPositionResponse(newPosition);
      }
    }

    /*
     * ============================================================
     * UPDATE ACCOUNT
     * ============================================================
     *
     * Balance:
     *     balance + realized PnL
     *
     * Equity:
     *     balance + total unrealized PnL
     */

    const currentBalance = toNumber(account.balance);

    const newBalance = currentBalance + realizedPnl;

    /*
     * Prisma 8 Contract ORM:
     *
     * KHÔNG dùng:
     * Position.findMany(...)
     *
     * Mà dùng:
     * Position.where(...).all()
     */
    const openPositions = await tx.orm.public.Position.where({
      accountId: account.id,
      status: "OPEN",
    }).all();

    const totalUnrealizedPnl = openPositions.reduce(
      (total, position) => total + toNumber(position.unrealizedPnl),
      0,
    );

    const newEquity = newBalance + totalUnrealizedPnl;

    /*
     * Prisma 8 Contract ORM:
     *
     * KHÔNG dùng:
     * DemoAccount.update({ where, data })
     *
     * Mà dùng:
     * DemoAccount.where(...).update(...)
     */
    await tx.orm.public.DemoAccount.where({ id: account.id }).update({
      balance: formatDecimal(newBalance),
      equity: formatDecimal(newEquity),
    });

    return {
      order,
      account,
      balance: formatDecimal(newBalance),
      equity: formatDecimal(newEquity),
      unrealizedPnl: formatDecimal(totalUnrealizedPnl),
      position: responsePosition,
      realizedPnl: formatDecimal(realizedPnl),
    };
  });

  return {
    order: toOrderResponse(result.order),

    account: {
      accountId: result.account.id,
      accountNumber: result.account.accountNumber,
      balance: result.balance,
      equity: result.equity,
      unrealizedPnl: result.unrealizedPnl,
    },

    position: result.position,

    realizedPnl: result.realizedPnl,
  };
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

  const items = orders
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .map(toOrderResponse);

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

  return toOrderResponse(order);
}

function toPositionListResponse(position: {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  quantity: unknown;
  averageEntryPrice: unknown;
  currentPrice: unknown;
  unrealizedPnl: unknown;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
}): PositionResponse {
  return {
    id: position.id,
    symbol: position.symbol,
    side: position.side,
    quantity: String(position.quantity),
    averageEntryPrice: String(position.averageEntryPrice),
    currentPrice:
      position.currentPrice === null ? null : String(position.currentPrice),
    unrealizedPnl: String(position.unrealizedPnl),
    status: position.status,
    openedAt: position.openedAt,
    closedAt: position.closedAt,
  };
}

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

  const items = positions
    .sort(
      (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
    )
    .map(toPositionListResponse);

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

  return toPositionListResponse(position);
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
    entryPrice: trade.entryPrice === null ? null : String(trade.entryPrice),
    exitPrice: trade.exitPrice === null ? null : String(trade.exitPrice),
    realizedPnl: trade.realizedPnl === null ? null : String(trade.realizedPnl),
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

    getMarketPrice("XAUUSD"),
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

        averageEntryPrice: String(position.averageEntryPrice),

        currentPrice: String(currentPrice),

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
