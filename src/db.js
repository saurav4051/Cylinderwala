import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSONFilePreset } from "lowdb/node";

const seededAt = new Date().toISOString();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const bundledDataDir = path.join(projectRoot, "data");
const defaultRuntimeDataDir = process.env.VERCEL
  ? path.join("/tmp", "cylinderwala-data")
  : bundledDataDir;
const runtimeDataDir = path.resolve(
  process.env.DATA_DIR || defaultRuntimeDataDir,
);
const bundledDbPath = path.join(bundledDataDir, "db.json");
const runtimeDbPath = path.join(runtimeDataDir, "db.json");

const defaultData = {
  adminAuth: null,
  customers: [],
  dealers: [
    {
      id: "dealer-hp-sector-62",
      name: "HP Gas Sector 62",
      brand: "HP Gas",
      phone: "9876500001",
      active: true,
      subscriptionStatus: "trial",
      location: { lat: 28.6283, lng: 77.3649 },
      pincode: "201309",
      bankAccount: "HPGAS-ACC-DEMO",
      createdAt: seededAt,
    },
  ],
  riders: [
    {
      id: "rider-amit",
      name: "Amit Kumar",
      phone: "9876501001",
      active: true,
      status: "available",
      vehicle: "bike",
      hasLeakDetector: true,
      hasDigitalScale: true,
      location: { lat: 28.6301, lng: 77.3624 },
      pincode: "201309",
      notificationRadiusKm: 7,
      lastSeenAt: seededAt,
    },
    {
      id: "rider-sana",
      name: "Sana Khan",
      phone: "9876501002",
      active: true,
      status: "available",
      vehicle: "bike",
      hasLeakDetector: true,
      hasDigitalScale: true,
      location: { lat: 28.6264, lng: 77.3708 },
      pincode: "201309",
      notificationRadiusKm: 5,
      lastSeenAt: seededAt,
    },
  ],
  orders: [],
  notifications: [],
  ledgerEntries: [],
};

await fs.mkdir(runtimeDataDir, { recursive: true });

if (process.env.VERCEL) {
  try {
    await fs.access(runtimeDbPath);
  } catch {
    try {
      await fs.copyFile(bundledDbPath, runtimeDbPath);
    } catch {
      // Fall back to defaultData when the bundled database file is absent.
    }
  }
}

export const db = await JSONFilePreset(runtimeDbPath, defaultData);
