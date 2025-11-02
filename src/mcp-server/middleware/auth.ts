import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../../utils/logger';

/**
 * Authentication middleware for MCP server
 * Supports two authentication methods:
 * 1. API Key (Bearer token in Authorization header)
 * 2. JWT Token (for multi-tenant scenarios)
 */

const API_KEYS = new Set<string>(
  (process.env.MCP_API_KEYS || '').split(',').filter(Boolean)
);

const JWT_SECRET = process.env.MCP_JWT_SECRET || 'change-this-secret-in-production';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    permissions?: string[];
  };
}

/**
 * Middleware to authenticate incoming MCP requests
 */
export function authenticateRequest(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Skip auth in development mode if configured
  if (process.env.MCP_SKIP_AUTH === 'true') {
    logger.warn('⚠️  Authentication disabled - development mode');
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing Authorization header',
    });
    return;
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid Authorization format. Use: Bearer <token>',
    });
    return;
  }

  // Try API Key authentication first
  if (API_KEYS.has(token)) {
    logger.info('✅ Authenticated via API Key');
    req.user = {
      id: 'api-key-user',
      permissions: ['*'],
    };
    next();
    return;
  }

  // Try JWT authentication
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    logger.info('✅ Authenticated via JWT', { userId: decoded.sub });
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      permissions: decoded.permissions || [],
    };
    next();
  } catch (error) {
    logger.error('❌ Authentication failed:', error);
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

/**
 * Generate a JWT token for a user
 * Useful for creating tokens programmatically
 */
export function generateJWT(user: {
  id: string;
  email?: string;
  permissions?: string[];
}): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      permissions: user.permissions || [],
    },
    JWT_SECRET,
    {
      expiresIn: '7d', // Token expires in 7 days
      issuer: 'vessel-tracking-mcp',
    }
  );
}

/**
 * Validate API key format
 */
export function isValidAPIKey(key: string): boolean {
  return /^vt_[a-zA-Z0-9]{32,}$/.test(key);
}

/**
 * Generate a new API key
 */
export function generateAPIKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'vt_';
  for (let i = 0; i < 48; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}
