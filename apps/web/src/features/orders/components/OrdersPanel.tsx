import { Activity, ArrowDown, ArrowUp } from "lucide-react";
import { useOrders } from "../hooks/useOrders";

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

  const orders = ordersQuery.data ?? [];

  return (
    <section className="dashboard-panel orders-panel">
      <div className="panel-header">
        <div>
          <h2>Order History</h2>
          <p>Lịch sử các MARKET order của tài khoản.</p>
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

      {!ordersQuery.isLoading &&
        !ordersQuery.isError &&
        orders.length === 0 && (
          <div className="workspace-placeholder">Chưa có order nào.</div>
        )}

      {orders.length > 0 && (
        <div className="orders-table-wrapper">
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
