import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { config, isSecureCookieEnv } from "./config.js";
import { db } from "./db.js";
import {
  acceptOrder,
  buildAdminLedger,
  createOrder,
  markPaymentSuccessful,
  updateOrderStatus,
  verifyOrderOtp,
} from "./services/order-service.js";
import {
  createPaymentOrder,
  verifyPaymentSignature,
} from "./services/payment-service.js";
import {
  publishToAdmins,
  publishToRiders,
  registerSseClient,
} from "./services/notification-hub.js";
import {
  changeAdminPassword,
  completePasswordRecovery,
  ensureAdminAuth,
  getAdminProfile,
  startPasswordRecovery,
  updateAdminRecovery,
  verifyAdminPassword,
} from "./services/admin-auth.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");
const privateDir = path.resolve(__dirname, "../private");
const adminCookieName = "cylinderwala_admin";

app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));
await ensureAdminAuth();

const locationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

const createOrderSchema = z.object({
  dealerId: z.string(),
  address: z.string().min(5),
  pincode: z.string().length(6),
  location: locationSchema,
  source: z.enum(["app", "pwa", "quick_form", "whatsapp"]).default("pwa"),
  notes: z.string().optional(),
  premiumSafety: z.boolean().default(false),
  gasBackGuarantee: z.boolean().default(false),
  emptyExchange: z.boolean().default(false),
  customer: z.object({
    name: z.string().min(2),
    phone: z.string().min(10),
  }),
});

const adminLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});
const recoverySchema = z.object({
  recoveryQuestion: z.string().min(6),
  recoveryAnswer: z.string().min(3),
});
const recoveryStartSchema = z.object({
  username: z.string().min(1),
});
const recoveryCompleteSchema = z.object({
  username: z.string().min(1),
  recoveryAnswer: z.string().min(1),
  newPassword: z.string().min(6),
});

const wrap = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    const statusCode =
      error instanceof Error && error.message === "Unauthorized" ? 401 : 400;
    res.status(statusCode).json({
      error: error instanceof Error ? error.message : "Unexpected error",
    });
  }
};

const parseCookies = (cookieHeader = "") =>
  Object.fromEntries(
    cookieHeader
      .split(";")
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const separatorIndex = chunk.indexOf("=");
        return [
          decodeURIComponent(chunk.slice(0, separatorIndex)),
          decodeURIComponent(chunk.slice(separatorIndex + 1)),
        ];
      }),
  );

const createAdminSessionToken = () => {
  const expiresAt = Date.now() + config.admin.sessionMaxAgeMs;
  const base = `${config.admin.username}.${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", config.admin.sessionSecret)
    .update(base)
    .digest("hex");
  return `${base}.${signature}`;
};

const verifyAdminSessionToken = (token) => {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [username, expiresAtRaw, signature] = parts;
  if (username !== config.admin.username) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expectedSignature = crypto
    .createHmac("sha256", config.admin.sessionSecret)
    .update(`${username}.${expiresAtRaw}`)
    .digest("hex");

  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  return (
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  );
};

const setAdminCookie = (res, token) => {
  const secureFlag = isSecureCookieEnv ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${adminCookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${Math.floor(
      config.admin.sessionMaxAgeMs / 1000,
    )}; SameSite=Lax${secureFlag}`,
  );
};

const clearAdminCookie = (res) => {
  const secureFlag = isSecureCookieEnv ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${adminCookieName}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secureFlag}`,
  );
};

const isAdminAuthenticated = (req) => {
  const cookies = parseCookies(req.headers.cookie);
  return verifyAdminSessionToken(cookies[adminCookieName]);
};

const requireAdmin = (req, res, next) => {
  if (!isAdminAuthenticated(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

const requireAdminPage = (req, res, next) => {
  if (!isAdminAuthenticated(req)) {
    res.redirect("/admin-login.html");
    return;
  }
  next();
};

app.get("/admin", requireAdminPage, (_, res) => {
  res.sendFile(path.join(privateDir, "admin.html"));
});

app.get("/admin.html", (req, res) => {
  if (!isAdminAuthenticated(req)) {
    res.redirect("/admin-login.html");
    return;
  }
  res.redirect("/admin");
});

app.get("/api", (_, res) => {
  res.json({
    status: "ok",
    app: config.appName,
    message: "CylinderWala API is running.",
    endpoints: {
      health: "/health",
      config: "/api/config",
      dealers: "/api/dealers",
      adminLogin: "/api/admin/login",
      adminPage: "/admin",
    },
  });
});

app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    app: config.appName,
    timestamp: new Date().toISOString(),
  });
});

app.post(
  "/api/admin/login",
  wrap(async (req, res) => {
    const payload = adminLoginSchema.parse(req.body);

    if (!(await verifyAdminPassword(payload))) {
      res.status(401).json({ error: "Invalid admin credentials" });
      return;
    }

    const token = createAdminSessionToken();
    setAdminCookie(res, token);
    res.json({
      ok: true,
      username: config.admin.username,
      redirectTo: "/admin",
    });
  }),
);

app.post("/api/admin/logout", (_, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

app.get("/api/admin/session", (req, res) => {
  res.json({
    authenticated: isAdminAuthenticated(req),
    username: isAdminAuthenticated(req) ? config.admin.username : null,
  });
});

app.get(
  "/api/admin/profile",
  requireAdmin,
  wrap(async (_, res) => {
    res.json(await getAdminProfile());
  }),
);

app.post(
  "/api/admin/change-password",
  requireAdmin,
  wrap(async (req, res) => {
    const payload = changePasswordSchema.parse(req.body);
    res.json(await changeAdminPassword(payload));
  }),
);

app.post(
  "/api/admin/recovery",
  requireAdmin,
  wrap(async (req, res) => {
    const payload = recoverySchema.parse(req.body);
    res.json(await updateAdminRecovery(payload));
  }),
);

app.post(
  "/api/admin/recovery/start",
  wrap(async (req, res) => {
    const payload = recoveryStartSchema.parse(req.body);
    res.json(await startPasswordRecovery(payload));
  }),
);

app.post(
  "/api/admin/recovery/complete",
  wrap(async (req, res) => {
    const payload = recoveryCompleteSchema.parse(req.body);
    res.json(await completePasswordRecovery(payload));
  }),
);

app.get("/api/config", (_, res) => {
  res.json({
    searchRadiusKm: config.defaultSearchRadiusKm,
    pricing: config.pricing,
  });
});

app.get("/api/dealers", (_, res) => {
  res.json(db.data.dealers);
});

app.post(
  "/api/dealers",
  requireAdmin,
  wrap(async (req, res) => {
    const dealer = {
      id: `dealer-${crypto.randomUUID()}`,
      ...req.body,
      active: true,
      subscriptionStatus: req.body.subscriptionStatus ?? "trial",
      createdAt: new Date().toISOString(),
    };
    db.data.dealers.push(dealer);
    await db.write();
    res.status(201).json(dealer);
  }),
);

app.get("/api/riders", requireAdmin, (_, res) => {
  res.json(db.data.riders);
});

app.patch(
  "/api/riders/:riderId/location",
  requireAdmin,
  wrap(async (req, res) => {
    const payload = z
      .object({
        location: locationSchema,
        status: z.enum(["available", "on_delivery", "offline"]).optional(),
      })
      .parse(req.body);

    const rider = db.data.riders.find((item) => item.id === req.params.riderId);
    if (!rider) {
      throw new Error("Rider not found");
    }

    rider.location = payload.location;
    rider.lastSeenAt = new Date().toISOString();
    if (payload.status) {
      rider.status = payload.status;
    }

    await db.write();
    res.json(rider);
  }),
);

app.get("/api/orders", requireAdmin, (req, res) => {
  const orders =
    req.query.status && typeof req.query.status === "string"
      ? db.data.orders.filter((order) => order.status === req.query.status)
      : db.data.orders;

  res.json(orders);
});

app.post(
  "/api/orders",
  wrap(async (req, res) => {
    const payload = createOrderSchema.parse(req.body);
    const { order, nearbyRiders } = await createOrder(payload);

    publishToAdmins("order.created", {
      orderId: order.id,
      location: order.location,
      status: order.status,
    });
    publishToRiders(
      nearbyRiders.map((rider) => rider.id),
      "order.nearby",
      {
        orderId: order.id,
        address: order.address,
        distanceByRider: nearbyRiders.reduce((acc, rider) => {
          acc[rider.id] = rider.distanceKm;
          return acc;
        }, {}),
      },
    );

    res.status(201).json({
      order,
      nearbyRiders,
      deliveryOtp: order.otpCode,
    });
  }),
);

app.post(
  "/api/orders/:orderId/accept",
  requireAdmin,
  wrap(async (req, res) => {
    const payload = z.object({ riderId: z.string() }).parse(req.body);
    const { order, rider } = await acceptOrder({
      orderId: req.params.orderId,
      riderId: payload.riderId,
    });

    publishToAdmins("order.accepted", {
      orderId: order.id,
      riderId: rider.id,
      acceptedAt: order.acceptedAt,
    });

    res.json({ order, rider });
  }),
);

app.post(
  "/api/orders/:orderId/payment-order",
  requireAdmin,
  wrap(async (req, res) => {
    const order = db.data.orders.find((item) => item.id === req.params.orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    const paymentOrder = await createPaymentOrder({
      orderId: order.id,
      amount: order.amounts.customerTotal,
      notes: {
        dealerId: order.dealerId,
        riderId: order.riderId ?? "unassigned",
      },
    });

    order.paymentOrder = paymentOrder;
    await db.write();
    res.json(paymentOrder);
  }),
);

app.post(
  "/api/orders/:orderId/payment-confirmation",
  requireAdmin,
  wrap(async (req, res) => {
    const payload = z
      .object({
        razorpayOrderId: z.string(),
        razorpayPaymentId: z.string(),
        razorpaySignature: z.string().optional(),
        paymentMode: z.string().default("upi"),
      })
      .parse(req.body);

    const valid = verifyPaymentSignature(payload);
    if (!valid) {
      throw new Error("Invalid payment signature");
    }

    const order = await markPaymentSuccessful({
      orderId: req.params.orderId,
      providerOrderId: payload.razorpayOrderId,
      providerPaymentId: payload.razorpayPaymentId,
      paymentMode: payload.paymentMode,
    });

    publishToAdmins("payment.captured", {
      orderId: order.id,
      amount: order.amounts.customerTotal,
    });

    res.json(order);
  }),
);

app.post(
  "/api/orders/:orderId/otp/verify",
  requireAdmin,
  wrap(async (req, res) => {
    const payload = z.object({ otpCode: z.string().length(6) }).parse(req.body);
    const order = await verifyOrderOtp({
      orderId: req.params.orderId,
      otpCode: payload.otpCode,
    });
    res.json(order);
  }),
);

app.patch(
  "/api/orders/:orderId/status",
  requireAdmin,
  wrap(async (req, res) => {
    const payload = z
      .object({
        status: z.enum([
          "pending_dispatch",
          "accepted",
          "picked_up",
          "on_the_way",
          "otp_verified",
          "delivered",
          "cancelled",
        ]),
      })
      .parse(req.body);

    const order = await updateOrderStatus({
      orderId: req.params.orderId,
      status: payload.status,
    });

    publishToAdmins("order.status_changed", {
      orderId: order.id,
      status: order.status,
    });

    res.json(order);
  }),
);

app.get("/api/dashboard/live-orders", requireAdmin, (_, res) => {
  res.json(
    db.data.orders
      .filter((order) =>
        ["pending_dispatch", "accepted", "picked_up", "on_the_way", "otp_verified"].includes(
          order.status,
        ),
      )
      .map((order) => ({
        id: order.id,
        status: order.status,
        address: order.address,
        location: order.location,
        dealerId: order.dealerId,
        riderId: order.riderId,
        requestedAt: order.requestedAt,
      })),
  );
});

app.get("/api/ledger", requireAdmin, (_, res) => {
  res.json(buildAdminLedger());
});

app.get("/api/notifications/stream", requireAdmin, (req, res) => {
  const riderId =
    typeof req.query.riderId === "string" ? req.query.riderId : null;
  const role = riderId ? "rider" : "admin";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const unregister = registerSseClient({ res, role, riderId });
  req.on("close", unregister);
});

export { app };
