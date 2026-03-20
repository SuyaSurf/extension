import jwt from 'jsonwebtoken';
import { UnauthorizedError, ForbiddenError } from './errorHandler.js';
import { cache } from '../config/redis.js';
import { logger } from '../utils/logger.js';

// JWT token verification
export const authMiddleware = async (request, reply) => {
  // Skip auth for health check and public routes
  const publicRoutes = ['/health'];
  if (publicRoutes.includes(request.url)) {
    return;
  }

  try {
    const token = extractToken(request);
    
    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    // Check if token is blacklisted
    const isBlacklisted = await cache.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new UnauthorizedError('Token has been revoked');
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user session exists in cache
    const session = await cache.get(`session:${decoded.userId}`);
    if (!session) {
      throw new UnauthorizedError('Session expired');
    }

    // Add user info to request
    request.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role || 'user'
    };

    logger.debug('User authenticated', { userId: decoded.userId });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      throw new UnauthorizedError('Invalid token');
    }
    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Token expired');
    }
    throw error;
  }
};

// Extract token from Authorization header or cookie
function extractToken(request) {
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Check for token in cookie
  if (request.cookies && request.cookies.token) {
    return request.cookies.token;
  }
  
  return null;
}

// Role-based access control
export const requireRole = (roles) => {
  return async (request, reply) => {
    const userRole = request.user?.role;
    
    if (!userRole) {
      throw new UnauthorizedError('Authentication required');
    }
    
    if (!roles.includes(userRole)) {
      throw new ForbiddenError('Insufficient permissions');
    }
    
    logger.debug('Role check passed', { userId: request.user.id, role: userRole });
  };
};

// API key authentication for service-to-service communication
export const apiKeyAuth = async (request, reply) => {
  const apiKey = request.headers['x-api-key'];
  
  if (!apiKey) {
    throw new UnauthorizedError('API key required');
  }
  
  // Validate API key against database or environment
  const validApiKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',') : [];
  
  if (!validApiKeys.includes(apiKey)) {
    throw new UnauthorizedError('Invalid API key');
  }
  
  request.service = true;
  logger.debug('API key authenticated');
};

// Generate JWT token
export const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    issuer: 'suya-surf-server',
    audience: 'suya-surf-extension'
  });
};

// Refresh token
export const refreshToken = async (refreshToken) => {
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Check if refresh token is still valid
    const session = await cache.get(`refresh:${decoded.userId}`);
    if (!session || session !== refreshToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    
    // Generate new access token
    const newToken = generateToken({
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role
    });
    
    return { token: newToken };
  } catch (error) {
    throw new UnauthorizedError('Invalid refresh token');
  }
};

// Logout - blacklist token
export const logout = async (token) => {
  // Add token to blacklist
  const decoded = jwt.decode(token);
  const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
  
  if (expiresIn > 0) {
    await cache.set(`blacklist:${token}`, true, expiresIn);
  }
  
  // Remove session from cache
  await cache.del(`session:${decoded.userId}`);
  
  logger.info('User logged out', { userId: decoded.userId });
};
