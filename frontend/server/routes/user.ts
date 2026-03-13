import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import jwt from "jsonwebtoken";
import User from "../db/models/User.js";
import Session from "../db/models/Session.js";
import { detectionPaths } from "../jobs/detection-jobs.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "yolo-crowd-jwt-secret-change-in-production";

const router = Router();

// Configure multer for profile photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(detectionPaths.runsDir, "profile_photos"));
  },
  filename: (req, file, cb) => {
    const userId = (req as any).userId || "unknown";
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${userId}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPG, PNG, and WebP are allowed."));
    }
  }
});

// Middleware to verify JWT
const authenticate = async (req: Request, res: Response, next: any) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const session = await Session.findOne({ token, isActive: true });
    if (!session) {
      return res.status(401).json({ message: "Session expired or invalid" });
    }
    (req as any).userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// Upload profile photo
router.post("/api/user/profile-photo", authenticate, upload.single("photo"), async (req, res) => {
  try {
    const userId = (req as any).userId;
    if (!req.file) {
      return res.status(400).json({ message: "No photo uploaded" });
    }

    const avatarUrl = `/api/user/profile-photo/${req.file.filename}`;
    await User.findByIdAndUpdate(userId, { avatarUrl });

    res.json({ avatarUrl, message: "Profile photo updated successfully" });
  } catch (error) {
    console.error("[user:upload-photo] Failed", error);
    res.status(500).json({ message: "Failed to upload photo" });
  }
});

// Get profile photo (serving it through a route to handle any future auth or logic)
router.get("/api/user/profile-photo/:filename", async (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(detectionPaths.runsDir, "profile_photos", filename);

  try {
    await fs.access(filePath);
    res.sendFile(filePath);
  } catch (error) {
    res.status(404).json({ message: "Photo not found" });
  }
});

// Generic get current user photo redirect/serve
router.get("/api/user/profile-photo", authenticate, async (req, res) => {
    try {
        const userId = (req as any).userId;
        const user = await User.findById(userId);
        if (user?.avatarUrl) {
            // If it's an internal API URL, we can just send the file
            if (user.avatarUrl.startsWith("/api/user/profile-photo/")) {
                const filename = user.avatarUrl.split("/").pop();
                const filePath = path.join(detectionPaths.runsDir, "profile_photos", filename!);
                return res.sendFile(filePath);
            }
            // If it's an external URL (Google/GitHub), redirect
            return res.redirect(user.avatarUrl);
        }
        res.status(404).json({ message: "No profile photo set" });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

export default router;
