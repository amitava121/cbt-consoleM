import { hash, verify } from "@node-rs/argon2";
import jwt, { type SignOptions } from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";

export interface TokenPayload {
  sub: string;
  role: string;
  deviceId?: string;
  examBatchId?: string;
  attemptId?: string;
  jti: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

export const hashPassword = async (password: string): Promise<string> => {
  return hash(password, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
    outputLen: 32,
  });
};

export const verifyPassword = async (
  password: string,
  passwordHash: string,
): Promise<boolean> => {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
};

const signToken = (
  payload: Omit<TokenPayload, "jti">,
  expiresIn: string,
  jti: string,
): string => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn,
    jwtid: jti,
  } as SignOptions);
};

export const generateTokenPair = (
  payload: Omit<TokenPayload, "jti">,
): TokenPair => {
  const accessJti = randomUUID();
  const refreshJti = randomUUID();

  const accessToken = signToken(payload, env.JWT_ACCESS_EXPIRY, accessJti);
  const refreshToken = signToken(payload, env.JWT_REFRESH_EXPIRY, refreshJti);

  const now = Date.now();
  const accessExpiryMs = ms(env.JWT_ACCESS_EXPIRY);
  const refreshExpiryMs = ms(env.JWT_REFRESH_EXPIRY);

  return {
    accessToken,
    refreshToken,
    accessExpiresAt: new Date(now + accessExpiryMs),
    refreshExpiresAt: new Date(now + refreshExpiryMs),
  };
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
};

export const decodeToken = (token: string): TokenPayload | null => {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
};

const ms = (time: string): number => {
  const match = time.match(/^([0-9]+)([smhd])$/);
  if (!match) throw new Error(`Invalid JWT expiry format: ${time}`);

  const value = Number.parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return value * multipliers[unit];
};
