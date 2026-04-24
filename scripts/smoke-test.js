import { app } from "../src/app.js";

const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));

const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

const readJson = async (response) => {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(body));
  }
  return body;
};

try {
  const adminLoginResponse = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.ADMIN_USERNAME ?? "admin",
      password: process.env.ADMIN_PASSWORD ?? "admin123",
    }),
  });
  const adminCookie = adminLoginResponse.headers.get("set-cookie") ?? "";
  await readJson(adminLoginResponse);

  const dealers = await readJson(await fetch(`${baseUrl}/api/dealers`));
  const riders = await readJson(
    await fetch(`${baseUrl}/api/riders`, {
      headers: { cookie: adminCookie },
    }),
  );

  const orderCreation = await readJson(
    await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dealerId: dealers[0].id,
        address: "Flat 12, Sector 62, Noida",
        pincode: "201309",
        location: { lat: 28.6295, lng: 77.3652 },
        source: "pwa",
        premiumSafety: true,
        gasBackGuarantee: true,
        emptyExchange: false,
        customer: {
          name: "Smoke Test User",
          phone: "9876599999",
        },
      }),
    }),
  );

  const adminOrders = await readJson(
    await fetch(`${baseUrl}/api/orders`, {
      headers: { cookie: adminCookie },
    }),
  );
  const createdOrder = adminOrders.find((order) => order.id === orderCreation.order.id);

  await readJson(
    await fetch(`${baseUrl}/api/orders/${orderCreation.order.id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ riderId: riders[0].id }),
    }),
  );

  await readJson(
    await fetch(`${baseUrl}/api/orders/${orderCreation.order.id}/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ otpCode: createdOrder?.otpCode }),
    }),
  );

  const paymentOrder = await readJson(
    await fetch(`${baseUrl}/api/orders/${orderCreation.order.id}/payment-order`, {
      method: "POST",
      headers: { cookie: adminCookie },
    }),
  );

  await readJson(
    await fetch(
      `${baseUrl}/api/orders/${orderCreation.order.id}/payment-confirmation`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: adminCookie },
        body: JSON.stringify({
          razorpayOrderId: paymentOrder.providerOrderId,
          razorpayPaymentId: `pay_${orderCreation.order.id}`,
          razorpaySignature: "mock_signature",
          paymentMode: "upi",
        }),
      },
    ),
  );

  const ledger = await readJson(
    await fetch(`${baseUrl}/api/ledger`, {
      headers: { cookie: adminCookie },
    }),
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        ordersInLedger: ledger.length,
        latestLedgerEntry: ledger.at(-1),
      },
      null,
      2,
    ),
  );
} finally {
  server.close();
}
