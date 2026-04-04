import path from "path";
import { createServer } from "./index";
import * as express from "express";
import { ensureDirectories, initializeEnvironment } from "./jobs/detection-jobs";

const app = createServer();
const port = process.env.PORT || 3000;

// API Root route (useful for health checks on Render)
app.get("/", (req, res) => {
  res.json({ message: "YOLO-CROWD API is running." });
});

// Initialize and start server
async function startServer() {
  try {
    console.log("[Server] Initializing directories and environment...");
    await ensureDirectories();
    await initializeEnvironment();
    
    app.listen(Number(port), "0.0.0.0", () => {
      console.log(`🚀 Fusion Starter server running on 0.0.0.0:${port}`);
      console.log(`📱 Frontend: http://localhost:${port}`);
      console.log(`🔧 API: http://localhost:${port}/api`);
    });
  } catch (error) {
    console.error("[Server] Critical initialization failure:", error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully");
  process.exit(0);
});
