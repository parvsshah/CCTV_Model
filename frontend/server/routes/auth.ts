import { RequestHandler, Router } from "express";
import jwt from "jsonwebtoken";
import { AuthLoginRequest, AuthLoginResponse, AuthMeResponse, UserSummary } from "@shared/api";
import User, { hashPassword } from "../db/models/User.js";
import Session from "../db/models/Session.js";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { isDBConnected } from "../db/connection.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "yolo-crowd-jwt-secret-change-in-production";

function toUserSummary(doc: InstanceType<typeof User>): UserSummary {
  return {
    id: doc._id.toString(),
    name: doc.name,
    username: doc.username,
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

export const handleRegister: RequestHandler<unknown, AuthLoginResponse | { message: string }, any> = async (req, res) => {
  const { name, username, email, password } = req.body;

  if (!name || !username || !email || !password) {
    return res.status(400).json({ message: "All fields are required" } as any);
  }

  if (!isDBConnected()) {
    return res.status(503).json({ message: "Database not available" } as any);
  }

  try {
    // Check if user already exists (email or username)
    const existing = await User.findOne({ 
      $or: [
        { email: email.toLowerCase().trim() },
        { username: username.toLowerCase().trim() }
      ]
    });
    
    if (existing) {
      const field = existing.email === email.toLowerCase().trim() ? "Email" : "Username";
      return res.status(400).json({ message: `${field} already taken` } as any);
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      name,
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role: "viewer"
    });

    const token = jwt.sign({ userId: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    const refreshToken = jwt.sign({ userId: user._id.toString(), type: "refresh" }, JWT_SECRET, { expiresIn: "30d" });

    await Session.create({
      userId: user._id,
      token,
      refreshToken,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      loginAt: new Date(),
      isActive: true,
    });

    return res.json({
      token,
      refreshToken,
      user: toUserSummary(user)
    });
  } catch (error) {
    console.error("[auth:register] error:", error);
    return res.status(500).json({ message: "Failed to create account" } as any);
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
// Passport OAuth strategies
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || "placeholder",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "placeholder",
      callbackURL: "/api/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ authProvider: "google", providerId: profile.id });
        if (!user) {
          // Check if email already exists
          const email = profile.emails?.[0].value;
          if (email) {
            user = await User.findOne({ email });
          }
          
          if (user) {
            // Link account
            user.authProvider = "google";
            user.providerId = profile.id;
            await user.save();
          } else {
            // Create new user
            user = await User.create({
              name: profile.displayName,
              username: (email?.split("@")[0] || profile.id).toLowerCase(),
              email: email,
              authProvider: "google",
              providerId: profile.id,
              avatarUrl: profile.photos?.[0].value,
              role: "viewer"
            });
          }
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID || "placeholder",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "placeholder",
      callbackURL: "/api/auth/github/callback",
    },
    async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        let user = await User.findOne({ authProvider: "github", providerId: profile.id });
        if (!user) {
          const email = profile.emails?.[0].value;
          if (email) {
            user = await User.findOne({ email });
          }
          
          if (user) {
            user.authProvider = "github";
            user.providerId = profile.id;
            await user.save();
          } else {
            user = await User.create({
              name: profile.displayName || profile.username,
              username: profile.username || profile.id,
              email: email || `${profile.id}@github.com`,
              authProvider: "github",
              providerId: profile.id,
              avatarUrl: profile.photos?.[0].value,
              role: "viewer"
            });
          }
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

export const authRouter = Router();

// OAuth routes
authRouter.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"], session: false }));
authRouter.get("/api/auth/google/callback", passport.authenticate("google", { failureRedirect: "/login", session: false }), async (req: any, res) => {
  const user = req.user;
  const token = jwt.sign({ userId: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: "7d" });
  res.redirect(`/login?token=${token}`); // Client side can pick up this token
});

authRouter.get("/api/auth/github", passport.authenticate("github", { scope: ["user:email"], session: false }));
authRouter.get("/api/auth/github/callback", passport.authenticate("github", { failureRedirect: "/login", session: false }), async (req: any, res) => {
  const user = req.user;
  const token = jwt.sign({ userId: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: "7d" });
  res.redirect(`/login?token=${token}`);
});
