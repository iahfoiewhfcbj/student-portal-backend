import express, { Response } from 'express';
import { body, query } from 'express-validator';
import prisma from '@/config/database';
import logger from '@/config/logger';
import { handleValidationErrors } from '@/middleware/validation';
import { authenticateToken, requireRole, AuthRequest } from '@/middleware/auth';
import { upload } from '@/middleware/upload';

const router = express.Router();

// Get submissions
router.get(
  '/',
  authenticateToken,
  [
    query('studentId').optional().isString(),
    query('eventPlanId').optional().isString(),
    query('status').optional().isIn(['submitted', 'pending', 'late']),
  ],
  handleValidationErrors,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { studentId, eventPlanId, status } = req.query;

      const where: any = {};
      
      // Students can only see their own submissions
      if (req.user!.role === 'STUDENT') {
        where.studentId = req.user!.id;
      } else if (studentId) {
        where.studentId = studentId as string;
      }
      
      if (eventPlanId) where.eventPlanId = eventPlanId as string;
      if (status) where.status = status;

      const submissions = await prisma.submission.findMany({
        where,
        include: {
          student: {
            select: { id: true, name: true, rollNumber: true, brigadeName: true },
          },
          eventPlan: {
            select: { 
              id: true, 
              title: true, 
              associatedEvent: {
                select: { id: true, name: true },
              },
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
      });

      logger.info('Submissions fetched:', {
        count: submissions.length,
        filters: { studentId, eventPlanId, status },
        requestedBy: req.user!.id,
      });

      res.json(submissions);
    } catch (error) {
      logger.error('Error fetching submissions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Create submission (Students only)
router.post(
  '/',
  authenticateToken,
  requireRole(['STUDENT']),
  upload.single('file'),
  [
    body('eventPlanId').notEmpty().withMessage('Event plan ID is required'),
    body('submissionType').isIn(['file', 'text', 'link']).withMessage('Invalid submission type'),
    body('content').optional().isString(),
  ],
  handleValidationErrors,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { eventPlanId, submissionType, content } = req.body;
      const file = req.file;

      // Check if event plan exists and requires submission
      const eventPlan = await prisma.eventPlan.findUnique({
        where: { id: eventPlanId },
      });

      if (!eventPlan) {
        res.status(404).json({ error: 'Event plan not found' });
        return;
      }

      if (eventPlan.planType !== 'withSubmission') {
        res.status(400).json({ error: 'This activity does not require submission' });
        return;
      }

      // Check if submission already exists
      const existingSubmission = await prisma.submission.findUnique({
        where: {
          studentId_eventPlanId: {
            studentId: req.user!.id,
            eventPlanId,
          },
        },
      });

      if (existingSubmission) {
        res.status(400).json({ error: 'Submission already exists for this activity' });
        return;
      }

      // Validate submission type matches event plan
      if (eventPlan.submissionType !== submissionType) {
        res.status(400).json({ 
          error: `This activity requires ${eventPlan.submissionType} submission` 
        });
        return;
      }

      // Validate submission content
      if (submissionType === 'file' && !file) {
        res.status(400).json({ error: 'File is required for file submission' });
        return;
      }

      if ((submissionType === 'text' || submissionType === 'link') && !content) {
        res.status(400).json({ error: 'Content is required for this submission type' });
        return;
      }

      const submissionData: any = {
        studentId: req.user!.id,
        eventPlanId,
        submissionType,
        status: 'submitted',
      };

      if (submissionType === 'file' && file) {
        submissionData.fileUrl = `/uploads/${file.filename}`;
        submissionData.fileName = file.originalname;
        submissionData.fileSize = file.size;
      } else {
        submissionData.content = content;
      }

      const submission = await prisma.submission.create({
        data: submissionData,
        include: {
          student: {
            select: { id: true, name: true, rollNumber: true, brigadeName: true },
          },
          eventPlan: {
            select: { 
              id: true, 
              title: true, 
              associatedEvent: {
                select: { id: true, name: true },
              },
            },
          },
        },
      });

      logger.info('Submission created:', {
        submissionId: submission.id,
        studentId: req.user!.id,
        eventPlanId,
        submissionType,
      });

      res.status(201).json(submission);
    } catch (error) {
      logger.error('Error creating submission:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Update submission status (Admin only)
router.put(
  '/:id/status',
  authenticateToken,
  requireRole(['ADMIN']),
  [
    body('status').isIn(['submitted', 'pending', 'late']).withMessage('Invalid status'),
  ],
  handleValidationErrors,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const submission = await prisma.submission.update({
        where: { id },
        data: { status },
        include: {
          student: {
            select: { id: true, name: true, rollNumber: true, brigadeName: true },
          },
          eventPlan: {
            select: { 
              id: true, 
              title: true, 
              associatedEvent: {
                select: { id: true, name: true },
              },
            },
          },
        },
      });

      logger.info('Submission status updated:', {
        submissionId: submission.id,
        newStatus: status,
        updatedBy: req.user!.id,
      });

      res.json(submission);
    } catch (error) {
      logger.error('Error updating submission status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Delete submission (Admin only)
router.delete(
  '/:id',
  authenticateToken,
  requireRole(['ADMIN']),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      await prisma.submission.delete({
        where: { id },
      });

      logger.info('Submission deleted:', {
        submissionId: id,
        deletedBy: req.user!.id,
      });

      res.json({ message: 'Submission deleted successfully' });
    } catch (error) {
      logger.error('Error deleting submission:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;