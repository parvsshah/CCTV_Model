import { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { AuthLoginRequest, AuthLoginResponse, AuthMeResponse, UserSummary } from "@shared/api";
import User from "../db/models/User.js";
import Session from "../db/models/Session.js";
import { isDBConnected } from "../db/connection.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "yolo-crowd-jwt-secret-change-in-production";

function toUserSummary(doc: InstanceType<typeof User>): UserSummary {
  return {
    id: doc._id.toString(),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    avatarUrl: doc.avatarUrl,
  };
}

export const handleLogin: RequestHandler<unknown, AuthLoginResponse | { message: string }, AuthLoginRequest> = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" } as any);
  }

  if (!isDBConnected()) {
    return res.status(503).json({ message: "Database not available" } as any);
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" } as any);
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" } as any);
    }

    const token = jwt.sign({ userId: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    const refreshToken = jwt.sign({ userId: user._id.toString(), type: "refresh" }, JWT_SECRET, { expiresIn: "30d" });

    // Create session record
    await Session.create({
      userId: user._id,
      token,
      refreshToken,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      loginAt: new Date(),
      isActive: true,
    });

    const response: AuthLoginResponse = {
      token,
      refreshToken,
      user: toUserSummary(user),
    };
    return res.json(response);
  } catch (error) {
    console.error("[auth:login] DB error:", error);
    return res.status(500).json({ message: "Internal server error" } as any);
  }
};

export const handleLogout: RequestHandler = async (req, res) => {
  if (isDBConnected()) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (token) {
        await Session.findOneAndUpdate(
          { token, isActive: true },
          { isActive: false, logoutAt: new Date() },
        );
      }
    } catch (error) {
      console.error("[auth:logout] DB error:", error);
    }
  }
  res.status(204).send();
};

export const handleMe: RequestHandler<unknown, AuthMeResponse | { message: string }> = async (req, res) => {
  if (!isDBConnected()) {
    return res.status(503).json({ message: "Database not available" } as any);
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "No token provided" } as any);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const session = await Session.findOne({ token, isActive: true });
    if (!session) {
      return res.status(401).json({ message: "Session expired or invalid" } as any);
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" } as any);
    }

    return res.json({ user: toUserSummary(user) });
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" } as any);
  }
};
