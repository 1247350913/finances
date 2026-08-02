import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";

import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";

async function start() {
  await mongoose.connect(config.mongodbUri);

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: config.authOrigin,
      credentials: true,
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "auth-service" });
  });

  app.use("/auth", authRouter);

  app.listen(config.port, () => {
    console.log(`[auth-service] listening on port ${config.port}`);
  });
}

start().catch((err) => {
  console.error("[auth-service] startup failed", err);
  process.exit(1);
});
