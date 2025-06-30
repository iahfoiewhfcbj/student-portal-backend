import express, { Response } from 'express';
import { body, query } from 'express-validator';
import prisma from '@/config/database';
import logger from '@/config/logger';
import { handleValidationErrors } from '@/middleware/validation';
import { authenticateToken, requireRole, AuthRequest } from '@/middleware/auth';

const router = express.Router();

// Get all events
router.get(
  '/',
  authenticateToken,
  [
    query('isActive').optional().isBoolean(),
  ],
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const { isActive } = req.query;

      const where: any = {};
      if (isActive !== undefined) where.isActive = isActive === 'true';

      const events = await prisma.event.findMany({
        where,
        include: {
          creator: {
            select: { id: true, name: true },
          },
          _count: {
            select: { eventPlans: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      logger.info('Events fetched:', {
        count: events.length,
        filters: { isActive },
        requestedBy: req.user!.id,
      });

      res.json(events);
    } catch (error) {
      logger.error('Error fetching events:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Create event (Admin only)
router.post(
  '/',
  authenticateToken,
  requireRole(['ADMIN']),
  [
    body('name').notEmpty().withMessage('Event name is required'),
    body('startDate').isISO8601().withMessage('Valid start date is required'),
    body('endDate').isISO8601().withMessage('Valid end date is required'),
  ],
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const { name, startDate, endDate } = req.body;

      const event = await prisma.event.create({
        data: {
          name,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          createdBy: req.user!.id,
        },
        include: {
          creator: {
            select: { id: true, name: true },
          },
          _count: {
            select: { eventPlans: true },
          },
        },
      });

      logger.info('Event created:', {
        eventId: event.id,
        name: event.name,
        createdBy: req.user!.id,
      });

      res.status(201).json(event);
    } catch (error) {
      logger.error('Error creating event:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Update event (Admin only)
router.put(
  '/:id',
  authenticateToken,
  requireRole(['ADMIN']),
  [
    body('name').optional().notEmpty().withMessage('Event name cannot be empty'),
    body('startDate').optional().isISO8601().withMessage('Valid start date is required'),
    body('endDate').optional().isISO8601().withMessage('Valid end date is required'),
    body('isActive').optional().isBoolean(),
  ],
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name, startDate, endDate, isActive } = req.body;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (startDate !== undefined) updateData.startDate = new Date(startDate);
      if (endDate !== undefined) updateData.endDate = new Date(endDate);
      if (isActive !== undefined) updateData.isActive = isActive;

      const event = await prisma.event.update({
        where: { id },
        data: updateData,
        include: {
          creator: {
            select: { id: true, name: true },
          },
          _count: {
            select: { eventPlans: true },
          },
        },
      });

      logger.info('Event updated:', {
        eventId: event.id,
        updatedBy: req.user!.id,
        changes: updateData,
      });

      res.json(event);
    } catch (error) {
      logger.error('Error updating event:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Delete event (Admin only)
router.delete(
  '/:id',
  authenticateToken,
  requireRole(['ADMIN']),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      await prisma.event.delete({
        where: { id },
      });

      logger.info('Event deleted:', {
        eventId: id,
        deletedBy: req.user!.id,
      });

      res.json({ message: 'Event deleted successfully' });
    } catch (error) {
      logger.error('Error deleting event:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;