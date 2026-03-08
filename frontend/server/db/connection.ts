import mongoose from "mongoose";

let isConnected = false;

export async function connectDB(): Promise<void> {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("[MongoDB] MONGODB_URI not set — skipping database connection");
    return;
  }

  try {
    await mongoose.connect(uri, {
      dbName: "yolo_crowd",
    });
    isConnected = true;
    console.log("[MongoDB] Connected to MongoDB Atlas successfully");
  } catch (error) {
    console.error("[MongoDB] Failed to connect:", error);
    throw error;
  }

  mongoose.connection.on("error", (err) => {
    console.error("[MongoDB] Connection error:", err);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[MongoDB] Disconnected from MongoDB");
    isConnected = false;
  });
}

export function isDBConnected(): boolean {
  return isConnected;
}
