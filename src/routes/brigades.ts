import express, { Response } from 'express';
import { body } from 'express-validator';
import prisma from '@/config/database';
import logger from '@/config/logger';
import { handleValidationErrors } from '@/middleware/validation';
import { authenticateToken, requireRole, AuthRequest } from '@/middleware/auth';

const router = express.Router();

// Get all brigades
router.get('/', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const brigades = await prisma.brigade.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    logger.info('Brigades fetched:', {
      count: brigades.length,
      requestedBy: req.user!.id,
    });

    res.json(brigades);
  } catch (error) {
    logger.error('Error fetching brigades:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create brigade (Admin only)
router.post(
  '/',
  authenticateToken,
  requireRole(['ADMIN']),
  [
    body('name').notEmpty().withMessage('Brigade name is required'),
  ],
  handleValidationErrors,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { name } = req.body;

      const existingBrigade = await prisma.brigade.findUnique({
        where: { name },
      });

      if (existingBrigade) {
        res.status(400).json({ error: 'Brigade already exists' });
        return;
      }

      const brigade = await prisma.brigade.create({
        data: { name },
        include: {
          _count: {
            select: { users: true },
          },
        },
      });

      logger.info('Brigade created:', {
        brigadeId: brigade.id,
        name: brigade.name,
        createdBy: req.user!.id,
      });

      res.status(201).json(brigade);
    } catch (error) {
      logger.error('Error creating brigade:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Update brigade (Admin only)
router.put(
  '/:id',
  authenticateToken,
  requireRole(['ADMIN']),
  [
    body('name').notEmpty().withMessage('Brigade name is required'),
  ],
  handleValidationErrors,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { name } = req.body;

      const existingBrigade = await prisma.brigade.findUnique({
        where: { name },
      });

      if (existingBrigade && existingBrigade.id !== id) {
        res.status(400).json({ error: 'Brigade name already exists' });
        return;
      }

      const brigade = await prisma.brigade.update({
        where: { id },
        data: { name },
        include: {
          _count: {
            select: { users: true },
          },
        },
      });

      // Update brigade name in users
      await prisma.user.updateMany({
        where: { brigadeId: id },
        data: { brigadeName: name },
      });

      logger.info('Brigade updated:', {
        brigadeId: brigade.id,
        name: brigade.name,
        updatedBy: req.user!.id,
      });

      res.json(brigade);
    } catch (error) {
      logger.error('Error updating brigade:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Delete brigade (Admin only)
router.delete(
  '/:id',
  authenticateToken,
  requireRole(['ADMIN']),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // Check if brigade has users
      const userCount = await prisma.user.count({
        where: { brigadeId: id },
      });

      if (userCount > 0) {
        res.status(400).json({ 
          error: `Cannot delete brigade. ${userCount} students are assigned to this brigade.` 
        });
        return;
      }

      await prisma.brigade.delete({
        where: { id },
      });

      logger.info('Brigade deleted:', {
        brigadeId: id,
        deletedBy: req.user!.id,
      });

      res.json({ message: 'Brigade deleted successfully' });
    } catch (error) {
      logger.error('Error deleting brigade:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;