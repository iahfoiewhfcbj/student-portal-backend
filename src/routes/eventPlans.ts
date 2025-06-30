import express, { Response } from 'express';
import { body, query } from 'express-validator';
import prisma from '@/config/database';
import logger from '@/config/logger';
import { handleValidationErrors } from '@/middleware/validation';
import { authenticateToken, requireRole, AuthRequest } from '@/middleware/auth';

const router = express.Router();

// Get event plans
router.get(
  '/',
  authenticateToken,
  [
    query('eventId').optional().isString(),
    query('date').optional().isISO8601(),
    query('planType').optional().isIn(['withSubmission', 'withoutSubmission']),
  ],
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const { eventId, date, planType } = req.query;

      const where: any = {};
      if (eventId) where.associatedEventId = eventId as string;
      if (date) {
        const targetDate = new Date(date as string);
        const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
        where.date = {
          gte: startOfDay,
          lte: endOfDay,
        };
      }
      if (planType) where.planType = planType;

      const eventPlans = await prisma.eventPlan.findMany({
        where,
        include: {
          associatedEvent: {
            select: { id: true, name: true },
          },
          creator: {
            select: { id: true, name: true },
          },
          _count: {
            select: { submissions: true },
          },
        },
        orderBy: [
          { date: 'asc' },
          { time: 'asc' },
        ],
      });

      logger.info('Event plans fetched:', {
        count: eventPlans.length,
        filters: { eventId, date, planType },
        requestedBy: req.user!.id,
      });

      res.json(eventPlans);
    } catch (error) {
      logger.error('Error fetching event plans:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Create event plan (Admin only)
router.post(
  '/',
  authenticateToken,
  requireRole(['ADMIN']),
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('description').optional().isString(),
    body('date').isISO8601().withMessage('Valid date is required'),
    body('time').notEmpty().withMessage('Time is required'),
    body('endTime').optional().isString(),
    body('associatedEventId').notEmpty().withMessage('Event ID is required'),
    body('planType').isIn(['withSubmission', 'withoutSubmission']).withMessage('Invalid plan type'),
    body('submissionType').optional().isIn(['file', 'text', 'link']),
    body('fileSizeLimit').optional().isInt({ min: 1, max: 100 }),
  ],
  handleValidationErrors,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const {
        title,
        description,
        date,
        time,
        endTime,
        associatedEventId,
        planType,
        submissionType,
        fileSizeLimit,
      } = req.body;

      // Validate submission requirements
      if (planType === 'withSubmission' && !submissionType) {
        res.status(400).json({ error: 'Submission type is required for submission plans' });
        return;
      }

      const eventPlan = await prisma.eventPlan.create({
        data: {
          title,
          description,
          date: new Date(date),
          time,
          endTime,
          associatedEventId,
          planType,
          submissionType: planType === 'withSubmission' ? submissionType : null,
          fileSizeLimit: submissionType === 'file' ? fileSizeLimit : null,
          createdBy: req.user!.id,
        },
        include: {
          associatedEvent: {
            select: { id: true, name: true },
          },
          creator: {
            select: { id: true, name: true },
          },
          _count: {
            select: { submissions: true },
          },
        },
      });

      logger.info('Event plan created:', {
        eventPlanId: eventPlan.id,
        title: eventPlan.title,
        planType: eventPlan.planType,
        createdBy: req.user!.id,
      });

      res.status(201).json(eventPlan);
    } catch (error) {
      logger.error('Error creating event plan:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Update event plan (Admin only)
router.put(
  '/:id',
  authenticateToken,
  requireRole(['ADMIN']),
  [
    body('title').optional().notEmpty().withMessage('Title cannot be empty'),
    body('description').optional().isString(),
    body('date').optional().isISO8601().withMessage('Valid date is required'),
    body('time').optional().notEmpty().withMessage('Time cannot be empty'),
    body('endTime').optional().isString(),
    body('isActive').optional().isBoolean(),
  ],
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { title, description, date, time, endTime, isActive } = req.body;

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (date !== undefined) updateData.date = new Date(date);
      if (time !== undefined) updateData.time = time;
      if (endTime !== undefined) updateData.endTime = endTime;
      if (isActive !== undefined) updateData.isActive = isActive;

      const eventPlan = await prisma.eventPlan.update({
        where: { id },
        data: updateData,
        include: {
          associatedEvent: {
            select: { id: true, name: true },
          },
          creator: {
            select: { id: true, name: true },
          },
          _count: {
            select: { submissions: true },
          },
        },
      });

      logger.info('Event plan updated:', {
        eventPlanId: eventPlan.id,
        updatedBy: req.user!.id,
        changes: updateData,
      });

      res.json(eventPlan);
    } catch (error) {
      logger.error('Error updating event plan:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Delete event plan (Admin only)
router.delete(
  '/:id',
  authenticateToken,
  requireRole(['ADMIN']),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      await prisma.eventPlan.delete({
        where: { id },
      });

      logger.info('Event plan deleted:', {
        eventPlanId: id,
        deletedBy: req.user!.id,
      });

      res.json({ message: 'Event plan deleted successfully' });
    } catch (error) {
      logger.error('Error deleting event plan:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;