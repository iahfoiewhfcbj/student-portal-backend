import express, { Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, query } from 'express-validator';
import prisma from '@/config/database';
import logger from '@/config/logger';
import { handleValidationErrors } from '@/middleware/validation';
import { authenticateToken, requireRole, AuthRequest } from '@/middleware/auth';

const router = express.Router();

// Get all users (Admin only)
router.get(
  '/',
  authenticateToken,
  requireRole(['ADMIN']),
  [
    query('role').optional().isIn(['ADMIN', 'STUDENT']),
    query('brigadeId').optional().isString(),
    query('search').optional().isString(),
  ],
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const { role, brigadeId, search } = req.query;

      const where: any = {};
      
      if (role) where.role = role;
      if (brigadeId) where.brigadeId = brigadeId;
      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
          { rollNumber: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          rollNumber: true,
          name: true,
          role: true,
          brigadeId: true,
          brigadeName: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      logger.info('Users fetched:', {
        count: users.length,
        filters: { role, brigadeId, search },
        requestedBy: req.user!.id,
      });

      return res.json(users);
    } catch (error) {
      logger.error('Error fetching users:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Create user (Admin only)
router.post(
  '/',
  authenticateToken,
  requireRole(['ADMIN']),
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['ADMIN', 'STUDENT']).withMessage('Invalid role'),
    body('email').optional().isEmail().withMessage('Invalid email'),
    body('rollNumber').optional().isString(),
    body('brigadeId').optional().isString(),
  ],
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const { name, email, rollNumber, password, role, brigadeId } = req.body;

      // Validate role-specific requirements
      if (role === 'ADMIN' && !email) {
        return res.status(400).json({ error: 'Email is required for admin users' });
      }
      
      if (role === 'STUDENT' && (!rollNumber || !brigadeId)) {
        return res.status(400).json({ error: 'Roll number and brigade are required for students' });
      }

      // Check for existing user
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            email ? { email } : {},
            rollNumber ? { rollNumber } : {},
          ].filter(obj => Object.keys(obj).length > 0),
        },
      });

      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Get brigade name if brigadeId provided
      let brigadeName;
      if (brigadeId) {
        const brigade = await prisma.brigade.findUnique({
          where: { id: brigadeId },
        });
        brigadeName = brigade?.name;
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      const userData: any = {
        name,
        password: hashedPassword,
        role,
        isActive: true,
      };

      if (role === 'ADMIN') {
        userData.email = email;
      } else {
        userData.email = `${rollNumber}@student.ignite.edu`;
        userData.rollNumber = rollNumber;
        userData.brigadeId = brigadeId;
        userData.brigadeName = brigadeName;
      }

      const user = await prisma.user.create({
        data: userData,
        select: {
          id: true,
          email: true,
          rollNumber: true,
          name: true,
          role: true,
          brigadeId: true,
          brigadeName: true,
          isActive: true,
          createdAt: true,
        },
      });

      logger.info('User created:', {
        userId: user.id,
        role: user.role,
        createdBy: req.user!.id,
      });

      return res.status(201).json(user);
    } catch (error) {
      logger.error('Error creating user:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Update user (Admin only)
router.put(
  '/:id',
  authenticateToken,
  requireRole(['ADMIN']),
  [
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('email').optional().isEmail().withMessage('Invalid email'),
    body('rollNumber').optional().isString(),
    body('brigadeId').optional().isString(),
    body('isActive').optional().isBoolean(),
  ],
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, email, rollNumber, brigadeId, isActive } = req.body;

      const existingUser = await prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (isActive !== undefined) updateData.isActive = isActive;

      if (existingUser.role === 'ADMIN') {
        if (email !== undefined) updateData.email = email;
      } else {
        if (rollNumber !== undefined) {
          updateData.rollNumber = rollNumber;
          updateData.email = `${rollNumber}@student.ignite.edu`;
        }
        if (brigadeId !== undefined) {
          updateData.brigadeId = brigadeId;
          // Get brigade name
          const brigade = await prisma.brigade.findUnique({
            where: { id: brigadeId },
          });
          updateData.brigadeName = brigade?.name;
        }
      }

      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          rollNumber: true,
          name: true,
          role: true,
          brigadeId: true,
          brigadeName: true,
          isActive: true,
          createdAt: true,
        },
      });

      logger.info('User updated:', {
        userId: user.id,
        updatedBy: req.user!.id,
        changes: updateData,
      });

      return res.json(user);
    } catch (error) {
      logger.error('Error updating user:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Delete user (Admin only)
router.delete(
  '/:id',
  authenticateToken,
  requireRole(['ADMIN']),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      await prisma.user.delete({
        where: { id },
      });

      logger.info('User deleted:', {
        userId: id,
        deletedBy: req.user!.id,
      });

      return res.json({ message: 'User deleted successfully' });
    } catch (error) {
      logger.error('Error deleting user:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;