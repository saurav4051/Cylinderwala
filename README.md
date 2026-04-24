# CylinderWala Backend

Backend MVP derived from the PDF brief for the Cylendra Wala launch week.

## What it covers

- Customer order intake for app, PWA, quick form, or WhatsApp fallback.
- Nearby rider dispatch based on rider coordinates and notification radius.
- OTP verification for safe handoff and delivery completion.
- Dispatcher-friendly live orders feed for a map-based dashboard.
- Admin ledger data with dealer settlement, rider payout, and platform revenue.
- Razorpay payment order creation with automatic mock mode when keys are absent.
- Fake-order seeding to run the "10 beta orders" requested in the PDF.

## Quick start

```bash
corepack pnpm install
corepack pnpm start
```

Server starts on `http://localhost:4000`.

## Hosting

This app serves both the website and API from the same Node process, so a single web service is enough.

### Vercel

The repo is set up so Vercel can deploy the Express app from `src/server.js` and serve `public/**` automatically.

Important: Vercel runs this app as a serverless function. Local file writes are temporary there, so `data/db.json` is copied into a temporary runtime directory and can reset between cold starts, scale events, or redeploys. Use Vercel mainly for demos unless you move persistence to a real database.

Steps:

```bash
npm i -g vercel
vercel
vercel --prod
```

Set these environment variables in the Vercel dashboard before production use:

- `NODE_ENV=production`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_RECOVERY_QUESTION`
- `ADMIN_RECOVERY_ANSWER`
- `ADMIN_SESSION_SECRET`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

### Render

The repo includes a `render.yaml` Blueprint for a Node web service.

Important: Render web services also use an ephemeral filesystem by default. For persistent orders and admin settings, attach a persistent disk and mount it at `/opt/render/project/src/data`, which matches the included `DATA_DIR` setting.

Steps:

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Render, create a new Blueprint and point it at this repository.
3. Review the generated `cylinderwala` web service.
4. Enter values for the `sync: false` environment variables during setup.
5. Attach a persistent disk mounted at `/opt/render/project/src/data` if you want data to survive restarts and redeploys.

### Generic server

Set these environment variables on your host:

```bash
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
```

Then start it with:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm start
```

### Run with Docker

```bash
docker build -t cylinderwala .
docker run --env-file .env -p 4000:4000 cylinderwala
```

The app will be available at `http://localhost:4000`.

## Useful scripts

```bash
corepack pnpm dev
corepack pnpm smoke
corepack pnpm seed:fake-orders
```

## Main API

- `GET /health`
- `GET /api/config`
- `GET /api/dealers`
- `GET /api/riders`
- `PATCH /api/riders/:riderId/location`
- `POST /api/orders`
- `GET /api/orders`
- `POST /api/orders/:orderId/accept`
- `POST /api/orders/:orderId/payment-order`
- `POST /api/orders/:orderId/payment-confirmation`
- `POST /api/orders/:orderId/otp/verify`
- `PATCH /api/orders/:orderId/status`
- `GET /api/dashboard/live-orders`
- `GET /api/ledger`
- `GET /api/notifications/stream?riderId=<riderId>`

## Pricing model note

The PDF mixed a fixed split example with a broader fee model. This backend keeps those numbers configurable and computes dealer settlement, rider payout, and platform revenue from the configured inputs so you can tune the commercial model without changing the API surface.
