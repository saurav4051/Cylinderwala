import crypto from "node:crypto";
import Razorpay from "razorpay";
import { config, hasRazorpayCredentials } from "../config.js";

let razorpayClient = null;

const getRazorpayClient = () => {
  if (!hasRazorpayCredentials) {
    return null;
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }

  return razorpayClient;
};

export const createPaymentOrder = async ({ orderId, amount, notes }) => {
  const client = getRazorpayClient();

  if (!client) {
    return {
      mode: "mock",
      providerOrderId: `mock_${orderId}`,
      amount,
      currency: config.razorpay.currency,
      notes,
    };
  }

  const razorpayOrder = await client.orders.create({
    amount: Math.round(amount * 100),
    currency: config.razorpay.currency,
    receipt: orderId,
    notes,
  });

  return {
    mode: "razorpay",
    providerOrderId: razorpayOrder.id,
    amount,
    currency: razorpayOrder.currency,
    notes: razorpayOrder.notes,
    razorpayKeyId: config.razorpay.keyId,
  };
};

export const verifyPaymentSignature = ({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) => {
  if (!hasRazorpayCredentials) {
    return true;
  }

  const signature = crypto
    .createHmac("sha256", config.razorpay.keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  return signature === razorpaySignature;
};
