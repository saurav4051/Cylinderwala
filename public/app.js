const state = {
  config: null,
  dealers: [],
};

const orderStatusEl = document.querySelector("#order-status");
const selectedDealerLabelEl = document.querySelector("#selected-dealer-label");
const orderFormEl = document.querySelector("#order-form");
const deliveryOtpPanelEl = document.querySelector("#delivery-otp-panel");
const deliveryOtpCodeEl = document.querySelector("#delivery-otp-code");
const otpOrderIdEl = document.querySelector("#otp-order-id");

const currency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
};

const setStatus = (message, tone = "neutral") => {
  orderStatusEl.textContent = message;
  orderStatusEl.style.color =
    tone === "success" ? "var(--green)" : tone === "error" ? "#8d4b46" : "";
};

const getPrimaryDealer = () => state.dealers[0];

const renderPricing = () => {
  if (!state.config) return;

  const pricingEl = document.querySelector("#pricing-breakdown");
  const totalEl = document.querySelector("#stat-price-total");
  const radiusEl = document.querySelector("#stat-radius");
  const { pricing, searchRadiusKm } = state.config;

  const previewTotal =
    pricing.cylinderBasePrice +
    pricing.convenienceFee +
    pricing.safetyPremiumFee +
    pricing.gasBackGuaranteeFee;

  pricingEl.innerHTML = `
    <div><span>Cylinder base</span><strong>${currency(pricing.cylinderBasePrice)}</strong></div>
    <div><span>Convenience</span><strong>${currency(pricing.convenienceFee)}</strong></div>
    <div><span>Safety add-on</span><strong>${currency(pricing.safetyPremiumFee)}</strong></div>
    <div><span>Gas-back guarantee</span><strong>${currency(pricing.gasBackGuaranteeFee)}</strong></div>
  `;
  totalEl.textContent = currency(previewTotal);
  radiusEl.textContent = `${searchRadiusKm} km`;
};

const renderDealers = () => {
  const dealerListEl = document.querySelector("#dealer-list");
  document.querySelector("#stat-dealers").textContent = String(state.dealers.length);

  const primaryDealer = getPrimaryDealer();
  selectedDealerLabelEl.textContent = primaryDealer
    ? `${primaryDealer.name} | ${primaryDealer.pincode}`
    : "No dealers available";

  dealerListEl.innerHTML =
    state.dealers.length > 0
      ? state.dealers
          .map(
            (dealer) => `
              <article class="list-card">
                <div>
                  <strong>${dealer.name}</strong>
                  <div class="muted">${dealer.brand} | ${dealer.phone}</div>
                  <div class="muted">Pincode ${dealer.pincode}</div>
                </div>
                <span class="badge">${dealer.subscriptionStatus}</span>
              </article>
            `,
          )
          .join("")
      : `<div class="empty-state">No dealers configured yet.</div>`;
};

const loadPublicData = async () => {
  const [config, dealers] = await Promise.all([
    fetchJson("/api/config"),
    fetchJson("/api/dealers"),
  ]);

  state.config = config;
  state.dealers = dealers;
  renderPricing();
  renderDealers();
};

const createOrder = async (event) => {
  event.preventDefault();

  const primaryDealer = getPrimaryDealer();
  if (!primaryDealer) {
    setStatus("No active dealer found. Add one before creating an order.", "error");
    return;
  }

  const formData = new FormData(orderFormEl);
  const payload = {
    dealerId: primaryDealer.id,
    address: String(formData.get("address") || ""),
    pincode: String(formData.get("pincode") || ""),
    location: {
      lat: Number(formData.get("lat")),
      lng: Number(formData.get("lng")),
    },
    source: String(formData.get("source") || "pwa"),
    notes: String(formData.get("notes") || ""),
    premiumSafety: formData.get("premiumSafety") === "on",
    gasBackGuarantee: formData.get("gasBackGuarantee") === "on",
    emptyExchange: formData.get("emptyExchange") === "on",
    customer: {
      name: String(formData.get("customerName") || ""),
      phone: String(formData.get("customerPhone") || ""),
    },
  };

  try {
    setStatus("Submitting your booking...");
    const result = await fetchJson("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setStatus(
      `Booking confirmed for ${result.order.address}. Keep the delivery OTP ready for handover.`,
      "success",
    );
    deliveryOtpPanelEl.hidden = false;
    deliveryOtpCodeEl.textContent = result.deliveryOtp || "------";
    otpOrderIdEl.textContent = `Order ${result.order.id.slice(0, 8)}...`;
    orderFormEl.reset();
    orderFormEl.elements.pincode.value = payload.pincode;
    orderFormEl.elements.lat.value = payload.location.lat;
    orderFormEl.elements.lng.value = payload.location.lng;
  } catch (error) {
    setStatus(error.message, "error");
  }
};

orderFormEl.addEventListener("submit", createOrder);

loadPublicData()
  .then(() => {
    setStatus("Fill in your details to place a booking.");
  })
  .catch((error) => {
    setStatus(error.message, "error");
  });
