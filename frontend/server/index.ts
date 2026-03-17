import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleLogin, handleLogout, handleMe, handleRegister, authRouter } from "./routes/auth";
import detectionRouter from "./routes/detection";
import dashboardRouter from "./routes/dashboard";
import userRouter from "./routes/user";
import passport from "passport";
import { detectionPaths } from "./jobs/detection-jobs";
import { connectDB } from "./db/connection";
import { seedDefaultAdmin } from "./db/seed";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors({
    origin: [
      "http://localhost:5173",
      "https://crowd-analysis.vercel.app"
    ],
    credentials: true
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Connect to MongoDB Atlas and seed default admin
  connectDB()
    .then(() => seedDefaultAdmin())
    .catch((err) => {
      console.warn("[Server] MongoDB connection failed:", err.message);
    });

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  app.use("/runs", express.static(detectionPaths.runsDir, { fallthrough: true }));

  // Passport initialization (for Session-less JWT strategy)
  app.use(passport.initialize());

  app.post("/api/auth/login", handleLogin);
  app.post("/api/auth/register", handleRegister);
  app.post("/api/auth/logout", handleLogout);
  app.get("/api/auth/me", handleMe);

  app.use(dashboardRouter);
  app.use(detectionRouter);
  app.use(authRouter);
  app.use(userRouter);

  return app;
}
