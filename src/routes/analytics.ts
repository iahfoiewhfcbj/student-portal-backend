
import express, { Response } from 'express';
import { query } from 'express-validator';
import prisma from '@/config/database';
import logger from '@/config/logger';
import { handleValidationErrors } from '@/middleware/validation';
import { authenticateToken, requireRole, AuthRequest } from '@/middleware/auth';

const router = express.Router();

// Get analytics data (Admin only)
router.get(
  '/',
  authenticateToken,
  requireRole(['ADMIN']),
  [
    query('eventId').optional().isString(),
    query('timeRange').optional().isIn(['7', '14', '30']),
  ],
  handleValidationErrors,
  async (req: AuthRequest, res: Response) => {
    try {
      const { eventId, timeRange = '7' } = req.query;

      // Calculate date range
      const days = parseInt(timeRange as string);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get basic statistics
      const [
        totalStudents,
        activeStudents,
        totalSubmissions,
        submittedCount,
        brigades,
        events,
        eventPlans,
      ] = await Promise.all([
        prisma.user.count({ where: { role: 'STUDENT' } }),
        prisma.user.count({ where: { role: 'STUDENT', isActive: true } }),
        prisma.submission.count(),
        prisma.submission.count({ where: { status: 'submitted' } }),
        prisma.brigade.findMany({
          include: {
            _count: { select: { users: true } },
          },
        }),
        prisma.event.findMany({
          where: eventId ? { id: eventId as string } : {},
          include: {
            _count: { select: { eventPlans: true } },
          },
        }),
        prisma.eventPlan.findMany({
          where: {
            planType: 'withSubmission',
            ...(eventId && { associatedEventId: eventId as string }),
          },
        }),
      ]);

      // Calculate participation rate
      const submissionRequiredPlans = eventPlans.length;
      const participationRate = totalStudents > 0 && submissionRequiredPlans > 0 
        ? (submittedCount / (submissionRequiredPlans * totalStudents)) * 100 
        : 0;

      // Brigade performance
      const brigadePerformance = await Promise.all(
        brigades.map(async (brigade) => {
          const brigadeStudents = await prisma.user.count({
            where: { brigadeId: brigade.id, role: 'STUDENT' },
          });

          const brigadeSubmissions = await prisma.submission.count({
            where: {
              status: 'submitted',
              student: { brigadeId: brigade.id },
            },
          });

          const brigadeParticipationRate = brigadeStudents > 0 
            ? (brigadeSubmissions / brigadeStudents) * 100 
            : 0;

          return {
            id: brigade.id,
            name: brigade.name,
            students: brigadeStudents,
            submissions: brigadeSubmissions,
            participationRate: Math.round(brigadeParticipationRate),
          };
        })
      );

      // Daily participation data
      const dailyParticipation = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const daySubmissions = await prisma.submission.count({
          where: {
            submittedAt: {
              gte: new Date(dateStr + 'T00:00:00.000Z'),
              lt: new Date(dateStr + 'T23:59:59.999Z'),
            },
          },
        });

        dailyParticipation.push({
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          submissions: daySubmissions,
          participation: totalStudents > 0 ? Math.round((daySubmissions / totalStudents) * 100) : 0,
        });
      }

      // Submission status breakdown
      const submissionStatusData = await prisma.submission.groupBy({
        by: ['status'],
        _count: { status: true },
      });

      const statusBreakdown = submissionStatusData.map(item => ({
        name: item.status.charAt(0).toUpperCase() + item.status.slice(1),
        value: item._count.status,
        color: item.status === 'submitted' ? '#10B981' : 
               item.status === 'pending' ? '#F59E0B' : '#EF4444',
      }));

      // Activity completion rates
      const activityCompletion = await Promise.all(
        eventPlans.slice(0, 10).map(async (plan) => {
          const planSubmissions = await prisma.submission.count({
            where: { eventPlanId: plan.id, status: 'submitted' },
          });

          const completionRate = totalStudents > 0 
            ? Math.round((planSubmissions / totalStudents) * 100) 
            : 0;

          return {
            id: plan.id,
            name: plan.title.length > 25 ? plan.title.substring(0, 25) + '...' : plan.title,
            completion: completionRate,
            submissions: planSubmissions,
            total: totalStudents,
            fullTitle: plan.title,
            date: plan.date.toLocaleDateString(),
            time: plan.time,
          };
        })
      );

      const analytics = {
        overview: {
          totalStudents,
          activeStudents,
          totalSubmissions,
          submittedCount,
          participationRate: Math.round(participationRate),
          totalEvents: events.length,
        },
        brigadePerformance,
        dailyParticipation,
        statusBreakdown,
        activityCompletion,
      };

      logger.info('Analytics data fetched:', {
        eventId,
        timeRange,
        requestedBy: req.user!.id,
      });

      res.json(analytics);
    } catch (error) {
      logger.error('Error fetching analytics:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;