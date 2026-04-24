import { v4 as uuid } from "uuid";
import { config } from "../config.js";
import { db } from "../db.js";
import { haversineDistanceKm } from "../utils/geo.js";

const now = () => new Date().toISOString();
const createOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

export const calculateOrderAmounts = ({
  premiumSafety = false,
  gasBackGuarantee = false,
  emptyExchange = false,
}) => {
  const customerFees = {
    convenienceFee: config.pricing.convenienceFee,
    safetyPremiumFee: premiumSafety ? config.pricing.safetyPremiumFee : 0,
    gasBackGuaranteeFee: gasBackGuarantee ? config.pricing.gasBackGuaranteeFee : 0,
    emptyExchangeHandlingFee: emptyExchange
      ? config.pricing.emptyExchangeHandlingFee
      : 0,
  };

  const customerFeeTotal = Object.values(customerFees).reduce(
    (total, amount) => total + amount,
    0,
  );
  const dealerShareGross = config.pricing.cylinderBasePrice;
  const providerCommission = Number(
    (dealerShareGross * config.pricing.providerCommissionRate).toFixed(2),
  );
  const riderPayout = config.pricing.riderPayout;
  const dealerSettlementNet = Number(
    (dealerShareGross - providerCommission).toFixed(2),
  );
  const platformRevenue = Number(
    (customerFeeTotal + providerCommission - riderPayout).toFixed(2),
  );
  const customerTotal = Number((dealerShareGross + customerFeeTotal).toFixed(2));

  return {
    customerFees,
    customerFeeTotal,
    customerTotal,
    dealerShareGross,
    providerCommission,
    dealerSettlementNet,
    riderPayout,
    platformRevenue,
  };
};

export const findNearbyRiders = (location) =>
  db.data.riders
    .filter((rider) => rider.active && rider.status === "available" && rider.location)
    .map((rider) => ({
      ...rider,
      distanceKm: Number(haversineDistanceKm(location, rider.location).toFixed(2)),
    }))
    .filter(
      (rider) =>
        rider.distanceKm <=
        (rider.notificationRadiusKm ?? config.defaultSearchRadiusKm),
    )
    .sort((left, right) => left.distanceKm - right.distanceKm);

export const upsertCustomer = (customerInput) => {
  const existing = db.data.customers.find(
    (customer) => customer.phone === customerInput.phone,
  );

  if (existing) {
    Object.assign(existing, customerInput, { updatedAt: now() });
    return existing;
  }

  const customer = {
    id: uuid(),
    ...customerInput,
    createdAt: now(),
    updatedAt: now(),
  };

  db.data.customers.push(customer);
  return customer;
};

export const createOrder = async (payload) => {
  const customer = upsertCustomer(payload.customer);
  const dealer = db.data.dealers.find((item) => item.id === payload.dealerId);
  if (!dealer) {
    throw new Error("Dealer not found");
  }

  const nearbyRiders = findNearbyRiders(payload.location);
  const order = {
    id: uuid(),
    customerId: customer.id,
    dealerId: dealer.id,
    riderId: null,
    status: "pending_dispatch",
    paymentStatus: "pending",
    source: payload.source ?? "pwa",
    address: payload.address,
    pincode: payload.pincode,
    location: payload.location,
    requestedAt: now(),
    acceptedAt: null,
    deliveredAt: null,
    otpCode: createOtp(),
    otpVerifiedAt: null,
    premiumSafety: Boolean(payload.premiumSafety),
    gasBackGuarantee: Boolean(payload.gasBackGuarantee),
    emptyExchange: Boolean(payload.emptyExchange),
    notes: payload.notes ?? "",
    nearbyRiderIds: nearbyRiders.map((rider) => rider.id),
    amounts: calculateOrderAmounts({
      premiumSafety: payload.premiumSafety,
      gasBackGuarantee: payload.gasBackGuarantee,
      emptyExchange: payload.emptyExchange,
    }),
  };

  db.data.orders.push(order);
  db.data.notifications.push(
    ...nearbyRiders.map((rider) => ({
      id: uuid(),
      riderId: rider.id,
      orderId: order.id,
      type: "new_order_nearby",
      status: "unread",
      createdAt: now(),
      distanceKm: rider.distanceKm,
    })),
  );
  await db.write();

  return { order, nearbyRiders };
};

export const acceptOrder = async ({ orderId, riderId }) => {
  const order = db.data.orders.find((item) => item.id === orderId);
  if (!order) {
    throw new Error("Order not found");
  }
  if (order.riderId) {
    throw new Error("Order already accepted");
  }

  const rider = db.data.riders.find((item) => item.id === riderId);
  if (!rider) {
    throw new Error("Rider not found");
  }

  order.riderId = rider.id;
  order.status = "accepted";
  order.acceptedAt = now();
  rider.status = "on_delivery";
  rider.lastSeenAt = now();

  await db.write();
  return { order, rider };
};

export const updateOrderStatus = async ({ orderId, status }) => {
  const order = db.data.orders.find((item) => item.id === orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  order.status = status;
  if (status === "delivered") {
    order.deliveredAt = now();
  }

  if (status === "delivered" && order.riderId) {
    const rider = db.data.riders.find((item) => item.id === order.riderId);
    if (rider) {
      rider.status = "available";
      rider.lastSeenAt = now();
    }
  }

  await db.write();
  return order;
};

export const verifyOrderOtp = async ({ orderId, otpCode }) => {
  const order = db.data.orders.find((item) => item.id === orderId);
  if (!order) {
    throw new Error("Order not found");
  }
  if (order.otpCode !== otpCode) {
    throw new Error("Invalid OTP");
  }

  order.otpVerifiedAt = now();
  order.status = "otp_verified";
  await db.write();
  return order;
};

export const markPaymentSuccessful = async ({
  orderId,
  providerOrderId,
  providerPaymentId,
  paymentMode,
}) => {
  const order = db.data.orders.find((item) => item.id === orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  order.paymentStatus = "paid";
  order.payment = {
    providerOrderId,
    providerPaymentId,
    paymentMode,
    paidAt: now(),
  };

  db.data.ledgerEntries.push({
    id: uuid(),
    orderId: order.id,
    customerTotal: order.amounts.customerTotal,
    dealerShareGross: order.amounts.dealerShareGross,
    dealerSettlementNet: order.amounts.dealerSettlementNet,
    riderPayout: order.amounts.riderPayout,
    platformRevenue: order.amounts.platformRevenue,
    paymentStatus: order.paymentStatus,
    createdAt: now(),
  });

  await db.write();
  return order;
};

export const buildAdminLedger = () =>
  db.data.orders.map((order) => ({
    orderId: order.id,
    status: order.status,
    amount: order.amounts.customerTotal,
    dealerShare: order.amounts.dealerSettlementNet,
    riderShare: order.amounts.riderPayout,
    ourProfit: order.amounts.platformRevenue,
    paymentStatus: order.paymentStatus,
    createdAt: order.requestedAt,
  }));
