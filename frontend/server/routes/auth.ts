import { RequestHandler } from "express";
import { AuthLoginRequest, AuthLoginResponse, AuthMeResponse, UserSummary } from "@shared/api";

const demoUser: UserSummary = {
  id: "user-1",
  name: "Avery Johnson",
  email: "admin@example.com",
  role: "admin",
};

const demoToken = "demo-token-123";
const demoRefreshToken = "demo-refresh-token-456";

export const handleLogin: RequestHandler<unknown, AuthLoginResponse, AuthLoginRequest> = (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" } as never);
  }

  if (email !== demoUser.email || password !== "password") {
    return res.status(401).json({ message: "Invalid credentials" } as never);
  }

  const response: AuthLoginResponse = {
    token: demoToken,
    refreshToken: demoRefreshToken,
    user: demoUser,
  };

  res.json(response);
};

export const handleLogout: RequestHandler = (_req, res) => {
  res.status(204).send();
};

export const handleMe: RequestHandler<unknown, AuthMeResponse> = (_req, res) => {
  res.json({ user: demoUser });
};


