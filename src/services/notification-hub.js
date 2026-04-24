const clients = new Set();

const sendEvent = (res, event, payload) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

export const registerSseClient = ({ res, role, riderId = null }) => {
  const client = { res, role, riderId };
  clients.add(client);
  sendEvent(res, "connected", {
    role,
    riderId,
    connectedAt: new Date().toISOString(),
  });

  return () => {
    clients.delete(client);
  };
};

export const publishToAdmins = (event, payload) => {
  for (const client of clients) {
    if (client.role === "admin") {
      sendEvent(client.res, event, payload);
    }
  }
};

export const publishToRiders = (riderIds, event, payload) => {
  const allowed = new Set(riderIds);
  for (const client of clients) {
    if (client.role === "rider" && client.riderId && allowed.has(client.riderId)) {
      sendEvent(client.res, event, payload);
    }
  }
};
