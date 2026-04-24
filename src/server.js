import { app } from "./app.js";
import { config } from "./config.js";

if (!process.env.VERCEL) {
  app.listen(config.port, config.host, () => {
    console.log(
      `${config.appName} listening on http://${config.host}:${config.port}`,
    );
  });
}

export default app;
