const state = {
  config: null,
  dealers: [],
  riders: [],
  orders: [],
  liveOrders: [],
  ledger: [],
};

const refreshButtonEl = document.querySelector("#refresh-button");
const activityFeedEl = document.querySelector("#activity-feed");
const activityItemTemplate = document.querySelector("#activity-item-template");
const liveOrdersEl = document.querySelector("#live-orders");
const logoutButtonEl = document.querySelector("#logout-button");
const changePasswordFormEl = document.querySelector("#change-password-form");
const changePasswordStatusEl = document.querySelector("#change-password-status");
const recoverySettingsFormEl = document.querySelector("#recovery-settings-form");
const recoverySettingsStatusEl = document.querySelector("#recovery-settings-status");
const recoveryQuestionInputEl = document.querySelector("#recovery-question-input");

const currency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const dateTime = (value) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not yet";

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const data = await response.json();
  if (response.status === 401) {
    window.location.href = "/admin-login.html";
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
};

const pushActivity = (title, description, timestamp = new Date().toISOString()) => {
  const node = activityItemTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector("strong").textContent = title;
  node.querySelector("p").textContent = description;
  node.querySelector("small").textContent = dateTime(timestamp);
  activityFeedEl.prepend(node);

  while (activityFeedEl.children.length > 12) {
    activityFeedEl.removeChild(activityFeedEl.lastElementChild);
  }
};

const setInlineStatus = (element, message, tone = "neutral") => {
  element.textContent = message;
  element.style.color =
    tone === "success" ? "var(--green)" : tone === "error" ? "#8d4b46" : "";
};

const renderAdminSummary = () => {
  const dealer = state.dealers[0];
  document.querySelector("#admin-dealer-label").textContent = dealer
    ? `${dealer.name} | ${dealer.pincode}`
    : "No dealer connected";
  document.querySelector("#admin-rider-count").textContent = String(
    state.riders.filter((rider) => rider.active).length,
  );
};

const updateKpis = () => {
  const paidOrders = state.orders.filter((order) => order.paymentStatus === "paid");
  const delivered = state.orders.filter((order) => order.status === "delivered");
  const revenue = state.ledger.reduce(
    (sum, entry) => sum + Number(entry.ourProfit || 0),
    0,
  );

  document.querySelector("#kpi-live-orders").textContent = String(state.liveOrders.length);
  document.querySelector("#kpi-paid-orders").textContent = String(paidOrders.length);
  document.querySelector("#kpi-revenue").textContent = currency(revenue);
  document.querySelector("#kpi-delivered").textContent = String(delivered.length);
  document.querySelector("#orders-count-badge").textContent = `${state.liveOrders.length} orders`;
  document.querySelector("#ledger-count-badge").textContent = `${state.ledger.length} entries`;
};

const renderFleet = () => {
  const riderListEl = document.querySelector("#rider-list");

  riderListEl.innerHTML =
    state.riders.length > 0
      ? state.riders
          .map(
            (rider) => `
              <article class="list-card">
                <div>
                  <strong>${rider.name}</strong>
                  <div class="muted">${rider.vehicle} | ${rider.phone}</div>
                  <div class="muted">Last seen ${dateTime(rider.lastSeenAt)}</div>
                </div>
                <span class="status-chip ${rider.status}">${rider.status.replaceAll("_", " ")}</span>
              </article>
            `,
          )
          .join("")
      : `<div class="empty-state">No riders configured yet.</div>`;
};

const renderLedger = () => {
  const ledgerListEl = document.querySelector("#ledger-list");

  ledgerListEl.innerHTML =
    state.ledger.length > 0
      ? [...state.ledger]
          .slice(-5)
          .reverse()
          .map(
            (entry) => `
              <article class="ledger-card">
                <strong>${entry.orderId.slice(0, 8)}... | ${entry.status.replaceAll("_", " ")}</strong>
                <div class="metric-row"><span>Customer total</span><strong>${currency(entry.amount)}</strong></div>
                <div class="metric-row"><span>Dealer share</span><strong>${currency(entry.dealerShare)}</strong></div>
                <div class="metric-row"><span>Rider payout</span><strong>${currency(entry.riderShare)}</strong></div>
                <div class="metric-row"><span>Platform revenue</span><strong>${currency(entry.ourProfit)}</strong></div>
              </article>
            `,
          )
          .join("")
      : `<div class="empty-state">Paid orders will appear here after payment confirmation.</div>`;
};

const nextRiderForOrder = (order) =>
  state.riders.find((rider) => order.nearbyRiderIds?.includes(rider.id)) || state.riders[0];

const orderActionButtons = (order) => {
  const actions = [];

  if (order.status === "pending_dispatch") {
    actions.push(
      `<button class="button button-primary" data-action="accept" data-order-id="${order.id}">Assign rider</button>`,
    );
  }

  if (!order.paymentOrder) {
    actions.push(
      `<button class="button button-secondary" data-action="payment-order" data-order-id="${order.id}">Create payment order</button>`,
    );
  }

  if (order.paymentOrder && order.paymentStatus !== "paid") {
    actions.push(
      `<button class="button button-secondary" data-action="payment-confirm" data-order-id="${order.id}">Mark paid</button>`,
    );
  }

  if (order.status !== "otp_verified" && order.status !== "delivered") {
    actions.push(
      `<button class="button button-secondary" data-action="verify-otp" data-order-id="${order.id}">Verify OTP</button>`,
    );
  }

  if (order.status !== "delivered" && order.status !== "cancelled") {
    actions.push(
      `<button class="button button-secondary" data-action="deliver" data-order-id="${order.id}">Complete delivery</button>`,
    );
  }

  return actions.join("");
};

const renderLiveOrders = () => {
  const sourceOrders = state.liveOrders.length > 0 ? state.liveOrders : state.orders;

  liveOrdersEl.innerHTML =
    sourceOrders.length > 0
      ? [...sourceOrders]
          .reverse()
          .map((order) => {
            const fullOrder = state.orders.find((entry) => entry.id === order.id) || order;
            const assignedRider = state.riders.find((rider) => rider.id === fullOrder.riderId);
            return `
              <article class="order-card">
                <div class="order-card-header">
                  <div>
                    <strong>${fullOrder.address}</strong>
                    <div class="muted">Order ${fullOrder.id.slice(0, 8)}... | ${dateTime(fullOrder.requestedAt)}</div>
                  </div>
                  <span class="status-chip ${fullOrder.status}">${fullOrder.status.replaceAll("_", " ")}</span>
                </div>
                <div class="metric-row"><span>Dealer</span><strong>${fullOrder.dealerId}</strong></div>
                <div class="metric-row"><span>Rider</span><strong>${assignedRider ? assignedRider.name : "Unassigned"}</strong></div>
                <div class="metric-row"><span>Payment</span><strong>${fullOrder.paymentStatus}</strong></div>
                <div class="metric-row"><span>Total</span><strong>${currency(fullOrder.amounts?.customerTotal || 0)}</strong></div>
                <div class="action-row">${orderActionButtons(fullOrder)}</div>
              </article>
            `;
          })
          .join("")
      : `<div class="empty-state">No active orders yet.</div>`;
};

const renderAll = () => {
  renderAdminSummary();
  updateKpis();
  renderFleet();
  renderLedger();
  renderLiveOrders();
};

const loadData = async () => {
  const [config, dealers, riders, orders, liveOrders, ledger, profile] = await Promise.all([
    fetchJson("/api/config"),
    fetchJson("/api/dealers"),
    fetchJson("/api/riders"),
    fetchJson("/api/orders"),
    fetchJson("/api/dashboard/live-orders"),
    fetchJson("/api/ledger"),
    fetchJson("/api/admin/profile"),
  ]);

  state.config = config;
  state.dealers = dealers;
  state.riders = riders;
  state.orders = orders;
  state.liveOrders = liveOrders;
  state.ledger = ledger;
  recoveryQuestionInputEl.value = profile.recoveryQuestion || "";
  renderAll();
};

const postAction = async (path, body) =>
  fetchJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

const patchAction = async (path, body) =>
  fetchJson(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const handleOrderAction = async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const orderId = button.dataset.orderId;
  const action = button.dataset.action;
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;

  try {
    if (action === "accept") {
      const rider = nextRiderForOrder(order);
      if (!rider) throw new Error("No rider available to accept this order");
      await postAction(`/api/orders/${orderId}/accept`, { riderId: rider.id });
      pushActivity("Rider assigned", `${rider.name} was assigned to order ${orderId.slice(0, 8)}.`);
    }

    if (action === "payment-order") {
      await postAction(`/api/orders/${orderId}/payment-order`);
      pushActivity("Payment order created", `Payment request created for order ${orderId.slice(0, 8)}.`);
    }

    if (action === "payment-confirm") {
      const paymentOrder =
        order.paymentOrder || (await postAction(`/api/orders/${orderId}/payment-order`));
      await postAction(`/api/orders/${orderId}/payment-confirmation`, {
        razorpayOrderId: paymentOrder.providerOrderId,
        razorpayPaymentId: `pay_${orderId}`,
        razorpaySignature: "mock_signature",
        paymentMode: "upi",
      });
      pushActivity("Payment updated", `Payment marked as received for order ${orderId.slice(0, 8)}.`);
    }

    if (action === "verify-otp") {
      await postAction(`/api/orders/${orderId}/otp/verify`, { otpCode: order.otpCode });
      pushActivity("OTP verified", `Delivery OTP verified for order ${orderId.slice(0, 8)}.`);
    }

    if (action === "deliver") {
      await patchAction(`/api/orders/${orderId}/status`, { status: "delivered" });
      pushActivity("Order delivered", `Order ${orderId.slice(0, 8)} marked delivered.`);
    }

    await loadData();
  } catch (error) {
    pushActivity("Action failed", error.message);
  }
};

const startNotifications = () => {
  const stream = new EventSource("/api/notifications/stream");

  const handleEvent = (label) => (event) => {
    try {
      const payload = JSON.parse(event.data);
      pushActivity(
        label,
        payload.orderId
          ? `Order ${String(payload.orderId).slice(0, 8)} has a new update.`
          : "A new update was received.",
      );
      loadData().catch(() => {});
    } catch {
      pushActivity("Update", "A new notification was received.");
    }
  };

  ["connected", "order.created", "order.accepted", "payment.captured", "order.status_changed"].forEach(
    (eventName) => {
      stream.addEventListener(eventName, handleEvent(eventName.replaceAll(".", " ")));
    },
  );

  stream.onerror = () => {
    pushActivity("Connection notice", "Live updates stopped. You can still refresh the page.");
    stream.close();
  };
};

refreshButtonEl.addEventListener("click", () => {
  loadData()
    .then(() => {
      pushActivity("Dashboard refreshed", "Latest data has been loaded.");
    })
    .catch((error) => {
      pushActivity("Refresh failed", error.message);
    });
});

liveOrdersEl.addEventListener("click", handleOrderAction);
logoutButtonEl.addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  window.location.href = "/admin-login.html";
});
changePasswordFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(changePasswordFormEl);

  try {
    setInlineStatus(changePasswordStatusEl, "Saving password...");
    await postAction("/api/admin/change-password", {
      currentPassword: String(formData.get("currentPassword") || ""),
      newPassword: String(formData.get("newPassword") || ""),
    });
    changePasswordFormEl.reset();
    setInlineStatus(changePasswordStatusEl, "Password updated.", "success");
    pushActivity("Password updated", "Your password was changed.");
  } catch (error) {
    setInlineStatus(changePasswordStatusEl, error.message, "error");
  }
});
recoverySettingsFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(recoverySettingsFormEl);

  try {
    setInlineStatus(recoverySettingsStatusEl, "Saving recovery details...");
    const profile = await postAction("/api/admin/recovery", {
      recoveryQuestion: String(formData.get("recoveryQuestion") || ""),
      recoveryAnswer: String(formData.get("recoveryAnswer") || ""),
    });
    recoveryQuestionInputEl.value = profile.recoveryQuestion || "";
    recoverySettingsFormEl.reset();
    recoveryQuestionInputEl.value = profile.recoveryQuestion || "";
    setInlineStatus(recoverySettingsStatusEl, "Recovery details saved.", "success");
    pushActivity("Recovery updated", "Recovery question and answer were updated.");
  } catch (error) {
    setInlineStatus(recoverySettingsStatusEl, error.message, "error");
  }
});

loadData()
  .then(() => {
    pushActivity("Dashboard ready", "Orders and reports are up to date.");
    startNotifications();
  })
  .catch((error) => {
    pushActivity("Connection failed", error.message);
  });
