import { db } from "../src/db.js";
import { createOrder } from "../src/services/order-service.js";

const targetDealerId = db.data.dealers[0]?.id;

if (!targetDealerId) {
  throw new Error("No dealer available for seeding");
}

for (let index = 0; index < 10; index += 1) {
  await createOrder({
    dealerId: targetDealerId,
    address: `Demo House ${index + 1}, Sector 62, Noida`,
    pincode: "201309",
    location: {
      lat: 28.6283 + index * 0.001,
      lng: 77.3649 + index * 0.001,
    },
    source: "quick_form",
    premiumSafety: index % 2 === 0,
    gasBackGuarantee: index % 3 === 0,
    emptyExchange: index % 4 === 0,
    customer: {
      name: `Customer ${index + 1}`,
      phone: `98765110${String(index).padStart(2, "0")}`,
    },
  });
}

console.log("Seeded 10 fake orders");
