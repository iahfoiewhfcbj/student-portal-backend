import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '@/config/database';
import logger from '@/config/logger';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string | null;
    rollNumber?: string | null;
    name: string;
    role: 'ADMIN' | 'STUDENT';
    brigadeId?: string | null;
    brigadeName?: string | null;
  };
}

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      logger.warn('Authentication failed: No token provided', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    // Fetch fresh user data from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        rollNumber: true,
        name: true,
        role: true,
        brigadeId: true,
        brigadeName: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      logger.warn('Authentication failed: User not found or inactive', {
        userId: decoded.userId,
        ip: req.ip,
      });
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    // Type-safe assignment
    req.user = {
      id: user.id,
      email: user.email,
      rollNumber: user.rollNumber,
      name: user.name,
      role: user.role as 'ADMIN' | 'STUDENT',
      brigadeId: user.brigadeId,
      brigadeName: user.brigadeName,
    };

    logger.debug('User authenticated successfully', {
      userId: user.id,
      role: user.role,
      ip: req.ip,
    });

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(403).json({ error: 'Invalid token' });
    return;
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Authorization failed: Insufficient permissions', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
        ip: req.ip,
      });
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};