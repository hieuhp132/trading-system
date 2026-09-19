import { AppError } from "../../common/errors/app-error";
import { db } from "../../database/prisma";
import type { CreateOrderInput } from "./schema";
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
} from "./types";
import { calculateUnrealizedPnl, roundMoney } from "../../common/utils/pnl";
import { getMarketPrice } from "../market/service";
import { XAUUSD_SPEC } from "../../common/constants/xauusd";

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

function calculateRequiredMargin(
  quantity: number,
  price: number,
  leverage: number,
): number {
  if (!Number.isFinite(leverage) || leverage <= 0) {
    throw new AppError(
      "Leverage của tài khoản không hợp lệ",
      500,
      "INVALID_ACCOUNT_LEVERAGE",
    );
  }

  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(price) ||
    price <= 0
  ) {
    throw new AppError(
      "Dữ liệu tính margin không hợp lệ",
      500,
      "INVALID_MARGIN_DATA",
    );
  }

  return (quantity * XAUUSD_SPEC.contractSize * price) / leverage;
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
  orderType: OrderType;
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
      order.requestedPrice === null
        ? null
        : formatPrice(Number(order.requestedPrice)),
    executedPrice:
      order.executedPrice === null
        ? null
        : formatPrice(Number(order.executedPrice)),
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
    averageEntryPrice: formatPrice(Number(position.averageEntryPrice)),
    currentPrice: formatPrice(Number(position.currentPrice)),
    unrealizedPnl: formatDecimal(Number(position.unrealizedPnl)),
    status: position.status,
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

  const marketPrice = await getMarketPrice(input.symbol);

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

    /*
     * Tìm position cùng chiều đang OPEN.
     */
    const existingPosition = await tx.orm.public.Position.where({
      accountId: account.id,
      symbol: input.symbol,
      status: "OPEN",
      side: positionSide,
    }).first();

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

    /*
     * ============================================================
     * CASE 1:
     * Đã có position cùng chiều
     * ============================================================
     */
    if (existingPosition) {
      const currentQuantity = toNumber(existingPosition.quantity);

      const currentAverage = toNumber(existingPosition.averageEntryPrice);

      const newQuantity = currentQuantity + quantity;

      const newAverage = calculateWeightedAverage(
        currentQuantity,
        currentAverage,
        quantity,
        normalizedExecutedPrice,
      );

      /*
       * Normalize weighted average để không lưu:
       *
       * 3651.2000000000003
       *
       * mà lưu:
       *
       * 3651.20
       */
      const normalizedAverage = Number(formatPrice(newAverage));

      /*
       * Tại thời điểm order vừa fill,
       * currentPrice = executedPrice.
       *
       * Vì vậy unrealized P&L tại chính thời điểm đó = 0.
       */
      const unrealizedPnl = calculatePnl(
        positionSide,
        normalizedAverage,
        normalizedExecutedPrice,
        newQuantity,
      );

      const updatedPosition = assertUpdated(
        await tx.orm.public.Position.where({
          id: existingPosition.id,
        }).update({
          quantity: String(newQuantity),
          averageEntryPrice: formatPrice(normalizedAverage),
          currentPrice: formatPrice(normalizedExecutedPrice),
          unrealizedPnl: formatDecimal(unrealizedPnl),
        }),
        "Không thể cập nhật position",
        "POSITION_UPDATE_FAILED",
      );

      /*
       * Mỗi MARKET order vẫn tạo một Trade riêng.
       *
       * Đây là OPEN/INCREASE trade,
       * chưa có exitPrice và realizedPnl.
       */
      await tx.orm.public.Trade.create({
        accountId: account.id,
        orderId: order.id,
        positionId: updatedPosition.id,
        symbol: input.symbol,
        side: input.side,
        quantity: input.quantity,
        entryPrice: formatPrice(normalizedExecutedPrice),
        exitPrice: null,
        realizedPnl: null,
        commission: ZERO,
      });

      responsePosition = toPositionResponse(updatedPosition);
    }

    /*
     * ============================================================
     * CASE 2:
     * Chưa có position cùng chiều
     * ============================================================
     */
    else {
      const newPosition = await tx.orm.public.Position.create({
        accountId: account.id,
        symbol: input.symbol,
        side: positionSide,
        quantity: input.quantity,
        averageEntryPrice: formatPrice(normalizedExecutedPrice),
        currentPrice: formatPrice(normalizedExecutedPrice),
        unrealizedPnl: ZERO,
        status: "OPEN",
      });

      /*
       * Opening trade.
       */
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
    }

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
        status: order.status,
        commission: order.commission,
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
    averageEntryPrice: formatPrice(Number(position.averageEntryPrice)),
    currentPrice:
      position.currentPrice === null
        ? null
        : formatPrice(Number(position.currentPrice)),
    unrealizedPnl: formatDecimal(Number(position.unrealizedPnl)),
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

  /*
   * MVP hiện tại chỉ hỗ trợ XAUUSD.
   *
   * Market price được lấy realtime từ MarketDataProvider.
   * GET /positions chỉ đọc dữ liệu và tính toán,
   * không cập nhật lại database.
   */
  const marketPrice = await getMarketPrice(XAUUSD_SPEC.symbol);

  const items = positions
    .sort(
      (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
    )
    .map((position) => {
      const quantity = toNumber(position.quantity);
      const entryPrice = toNumber(position.averageEntryPrice);

      /*
       * LONG:
       *   Entry  = ASK
       *   Current valuation = BID
       *
       * SHORT:
       *   Entry  = BID
       *   Current valuation = ASK
       */
      const currentPrice =
        position.side === "LONG"
          ? Number(marketPrice.bid)
          : Number(marketPrice.ask);

      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        throw new AppError(
          "Giá thị trường không hợp lệ",
          502,
          "INVALID_MARKET_PRICE",
        );
      }

      /*
       * Position OPEN:
       *   Tính unrealized PnL realtime.
       *
       * Position CLOSED:
       *   Không còn unrealized PnL.
       */
      const unrealizedPnl =
        position.status === "OPEN"
          ? calculatePnl(position.side, entryPrice, currentPrice, quantity)
          : 0;

      return {
        id: position.id,
        symbol: position.symbol,
        side: position.side,
        quantity: String(position.quantity),
        averageEntryPrice: formatPrice(entryPrice),
        currentPrice: formatPrice(currentPrice),
        unrealizedPnl: formatDecimal(unrealizedPnl),
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

export async function closePosition(userId: string, positionId: string) {
  const marketPrice = await getMarketPrice(XAUUSD_SPEC.symbol);

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

    const position = await tx.orm.public.Position.where({
      id: positionId,
      accountId: account.id,
      status: "OPEN",
    }).first();

    if (!position) {
      throw new AppError(
        "Position không tồn tại hoặc đã được đóng",
        404,
        "POSITION_NOT_FOUND",
      );
    }

    const quantity = toNumber(position.quantity);
    const entryPrice = toNumber(position.averageEntryPrice);

    /*
     * Đóng position:
     *
     * LONG  -> SELL -> BID
     * SHORT -> BUY  -> ASK
     */
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
      quantity,
    );

    const now = new Date().toISOString();

    /**
     * Atomic state transition.
     *
     * Chỉ request đầu tiên được phép chuyển
     * Position từ OPEN sang CLOSED.
     */
    const closedPosition = await tx.orm.public.Position.where({
      id: position.id,
      accountId: account.id,
      status: "OPEN",
    }).update({
      quantity: ZERO,
      currentPrice: formatPrice(normalizedClosePrice),
      unrealizedPnl: ZERO,
      status: "CLOSED",
      closedAt: now,
    });

    if (!closedPosition) {
      throw new AppError(
        "Position không tồn tại hoặc đã được đóng",
        404,
        "POSITION_NOT_FOUND",
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
      quantity: String(quantity),
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
      quantity: String(quantity),
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
      position: closedPosition,
      account: updatedAccount,
      realizedPnl,
      unrealizedPnl: totalUnrealizedPnl,
    };
  });

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
