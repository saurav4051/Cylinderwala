import dotenv from "dotenv";

dotenv.config();

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: toNumber(process.env.PORT, 4000),
  host: process.env.HOST ?? "0.0.0.0",
  nodeEnv: process.env.NODE_ENV ?? "development",
  appName: process.env.APP_NAME ?? "CylinderWala Backend",
  defaultSearchRadiusKm: toNumber(process.env.DEFAULT_SEARCH_RADIUS_KM, 7),
  admin: {
    username: process.env.ADMIN_USERNAME ?? "admin",
    password: process.env.ADMIN_PASSWORD ?? "admin123",
    recoveryQuestion:
      process.env.ADMIN_RECOVERY_QUESTION ?? "What is your admin recovery phrase?",
    recoveryAnswer:
      process.env.ADMIN_RECOVERY_ANSWER ?? "cylinderwala-recovery",
    sessionSecret:
      process.env.ADMIN_SESSION_SECRET ?? "change-this-admin-secret",
    sessionMaxAgeMs: toNumber(
      process.env.ADMIN_SESSION_MAX_AGE_MS,
      1000 * 60 * 60 * 12,
    ),
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? "",
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
    currency: process.env.RAZORPAY_CURRENCY ?? "INR",
  },
  pricing: {
    cylinderBasePrice: toNumber(process.env.CYLINDER_BASE_PRICE, 900),
    convenienceFee: toNumber(process.env.CONVENIENCE_FEE, 20),
    safetyPremiumFee: toNumber(process.env.SAFETY_PREMIUM_FEE, 30),
    gasBackGuaranteeFee: toNumber(process.env.GAS_BACK_GUARANTEE_FEE, 10),
    emptyExchangeHandlingFee: toNumber(process.env.EMPTY_EXCHANGE_HANDLING_FEE, 15),
    riderPayout: toNumber(process.env.RIDER_PAYOUT, 30),
    providerCommissionRate: toNumber(process.env.PROVIDER_COMMISSION_RATE, 0.02),
  },
};

export const hasRazorpayCredentials = Boolean(
  config.razorpay.keyId && config.razorpay.keySecret,
);

export const isSecureCookieEnv =
  config.nodeEnv === "production" ||
  process.env.SECURE_COOKIES === "true";
