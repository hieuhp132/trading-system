import { Activity, ArrowDown, ArrowUp, X } from "lucide-react";

import { useOrders } from "../hooks/useOrders";
import { useCancelOrder } from "../hooks/useCancelOrder";

function formatMoney(value: string | number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatDate(value: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("vi-VN");
}

export function OrdersPanel() {
  const ordersQuery = useOrders();
  const cancelOrderMutation = useCancelOrder();

  const orders = ordersQuery.data ?? [];

  const cancellingOrderId = cancelOrderMutation.isPending
    ? cancelOrderMutation.variables
    : null;

  function handleCancel(orderId: string) {
    if (cancelOrderMutation.isPending) {
      return;
    }

    cancelOrderMutation.mutate(orderId);
  }

  return (
    <section className="dashboard-panel orders-panel">
      <div className="panel-header">
        <div>
          <h2>Order History</h2>
          <p>Lịch sử các lệnh giao dịch của tài khoản.</p>
        </div>

        <Activity size={18} />
      </div>

      {ordersQuery.isLoading && (
        <div className="workspace-placeholder">Đang tải orders...</div>
      )}

      {ordersQuery.isError && (
        <div className="trading-order-panel__error">
          Không thể tải lịch sử orders.
        </div>
      )}
      {cancelOrderMutation.isError && (
        <div className="trading-order-panel__error" role="alert">
          Không thể hủy lệnh. Lệnh có thể đã được khớp hoặc hủy trước đó.
        </div>
      )}
      {!ordersQuery.isLoading &&
        !ordersQuery.isError &&
        orders.length === 0 && (
          <div className="workspace-placeholder">Chưa có order nào.</div>
        )}

      {orders.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="orders-table-wrapper orders-desktop">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Type</th>
                  <th>Quantity</th>
                  <th>Requested</th>
                  <th>Executed</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {orders.map((order) => {
                  const isBuy = order.side === "BUY";

                  return (
                    <tr key={order.id}>
                      <td>{formatDate(order.createdAt)}</td>

                      <td>
                        <strong>{order.symbol}</strong>
                      </td>

                      <td>
                        <span
                          className={`order-side order-side--${
                            isBuy ? "buy" : "sell"
                          }`}
                        >
                          {isBuy ? (
                            <ArrowUp size={14} />
                          ) : (
                            <ArrowDown size={14} />
                          )}

                          {order.side}
                        </span>
                      </td>

                      <td>{order.orderType}</td>

                      <td>{order.quantity}</td>

                      <td>
                        {order.requestedPrice !== null
                          ? formatMoney(order.requestedPrice)
                          : "--"}
                      </td>

                      <td>
                        {order.executedPrice !== null
                          ? formatMoney(order.executedPrice)
                          : "--"}
                      </td>

                      <td>
                        <span
                          className={`order-status order-status--${order.status.toLowerCase()}`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td>
                        {order.status === "PENDING" &&
                          (order.orderType === "BUY_LIMIT" ||
                            order.orderType === "SELL_LIMIT") && (
                            <button
                              type="button"
                              className="order-cancel-button"
                              onClick={() => handleCancel(order.id)}
                              disabled={cancelOrderMutation.isPending}
                              aria-label={`Hủy lệnh ${order.id}`}
                            >
                              <X size={14} />

                              {cancellingOrderId === order.id
                                ? "Cancelling..."
                                : "Cancel"}
                            </button>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="orders-mobile">
            {orders.map((order) => {
              const isBuy = order.side === "BUY";

              return (
                <article className="order-mobile-card" key={order.id}>
                  <div className="order-mobile-card__header">
                    <div className="order-mobile-card__identity">
                      <strong className="order-mobile-card__symbol">
                        {order.symbol}
                      </strong>

                      <span
                        className={`order-side order-side--${
                          isBuy ? "buy" : "sell"
                        }`}
                      >
                        {isBuy ? (
                          <ArrowUp size={14} />
                        ) : (
                          <ArrowDown size={14} />
                        )}

                        {order.side}
                      </span>
                    </div>

                    <span
                      className={`order-status order-status--${order.status.toLowerCase()}`}
                    >
                      {order.status}
                    </span>
                  </div>

                  <div className="order-mobile-card__meta">
                    <span>{formatDate(order.createdAt)}</span>
                    <span className="order-mobile-card__type">
                      {order.orderType}
                    </span>
                  </div>

                  <div className="order-mobile-card__details">
                    <div>
                      <span>Quantity</span>
                      <strong>{order.quantity}</strong>
                    </div>

                    <div>
                      <span>Requested Price</span>
                      <strong>
                        {order.requestedPrice !== null
                          ? formatMoney(order.requestedPrice)
                          : "--"}
                      </strong>
                    </div>

                    <div>
                      <span>Executed Price</span>
                      <strong>
                        {order.executedPrice !== null
                          ? formatMoney(order.executedPrice)
                          : "--"}
                      </strong>
                    </div>
                  </div>

                  {order.status === "PENDING" &&
                    (order.orderType === "BUY_LIMIT" ||
                      order.orderType === "SELL_LIMIT") && (
                      <button
                        type="button"
                        className="order-cancel-button"
                        onClick={() => handleCancel(order.id)}
                        disabled={cancelOrderMutation.isPending}
                        aria-label={`Hủy lệnh ${order.id}`}
                      >
                        <X size={14} />

                        {cancellingOrderId === order.id
                          ? "Cancelling..."
                          : "Cancel Order"}
                      </button>
                    )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
