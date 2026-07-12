import { buildApp } from "./app.js";

const PORT = Number(process.env.PORT) || 3333;

async function start() {
  const app = buildApp();

  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void start();
