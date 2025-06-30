import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const __dirname = path.resolve();

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  method?: string;
  url?: string;
  statusCode?: number;
  userId?: string;
  userRole?: string;
  ip?: string;
  userAgent?: string;
  duration?: number;
  meta?: Record<string, any>;
  service?: string;
}

interface LogsQueryParams {
  level?: 'info' | 'warn' | 'error' | 'debug';
  method?: string;
  startDate?: string;
  endDate?: string;
  userId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// Helper function to read and parse log files
const readLogFile = async (filename: string): Promise<LogEntry[]> => {
  try {
    const logPath = path.join(__dirname, '../../logs', filename);
    const data = await fs.readFile(logPath, 'utf-8');
    const lines = data.trim().split('\n').filter(line => line.trim());
    
    return lines.map(line => {
      try {
        const parsed = JSON.parse(line);
        // Ensure the log has an ID
        if (!parsed.id) {
          parsed.id = uuidv4();
        }
        return parsed as LogEntry;
      } catch (e) {
        // Handle non-JSON log lines
        return {
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          level: 'info' as const,
          message: line,
          service: 'ignite-backend'
        };
      }
    });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

// GET /api/logs - Get all logs with pagination and filtering
router.get('/', async (req, res) => {
  try {
    const { 
      level, 
      method,
      startDate, 
      endDate, 
      userId,
      page = 1, 
      limit = 100,
      search 
    }: LogsQueryParams = req.query;

    // Read both log files
    const [errorLogs, combinedLogs] = await Promise.all([
      readLogFile('error.log'),
      readLogFile('combined.log')
    ]);

    // Combine and deduplicate logs
    const allLogs = [...combinedLogs, ...errorLogs];
    const logMap = new Map();
    
    allLogs.forEach(log => {
      const key = `${log.timestamp}-${log.message}-${log.level}`;
      if (!logMap.has(key)) {
        logMap.set(key, log);
      }
    });

    let logs = Array.from(logMap.values());

    // Sort by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply filters
    if (level) {
      logs = logs.filter(log => log.level === level);
    }

    if (method) {
      logs = logs.filter(log => log.method?.toLowerCase() === method.toLowerCase());
    }

    if (userId) {
      logs = logs.filter(log => log.userId === userId);
    }

    if (startDate) {
      const start = new Date(startDate);
      logs = logs.filter(log => new Date(log.timestamp) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      logs = logs.filter(log => new Date(log.timestamp) <= end);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      logs = logs.filter(log => 
        (log.message && log.message.toLowerCase().includes(searchLower)) ||
        (log.level && log.level.toLowerCase().includes(searchLower)) ||
        (log.service && log.service.toLowerCase().includes(searchLower)) ||
        (log.method && log.method.toLowerCase().includes(searchLower)) ||
        (log.url && log.url.toLowerCase().includes(searchLower)) ||
        (log.userId && log.userId.toLowerCase().includes(searchLower))
      );
    }

    // Pagination
    const pageNum = parseInt(page?.toString() || '1');
    const limitNum = parseInt(limit?.toString() || '100');
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;

    const paginatedLogs = logs.slice(startIndex, endIndex);

    res.json({
      logs: paginatedLogs,
      total: logs.length,
      page: pageNum,
      totalPages: Math.ceil(logs.length / limitNum),
      // Legacy pagination fields for backward compatibility
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(logs.length / limitNum),
        totalLogs: logs.length,
        hasNext: endIndex < logs.length,
        hasPrev: pageNum > 1
      },
      filters: {
        level,
        method,
        startDate,
        endDate,
        userId,
        search
      }
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// GET /api/logs/stats - Get comprehensive log statistics
router.get('/stats', async (req, res) => {
  try {
    const [errorLogs, combinedLogs] = await Promise.all([
      readLogFile('error.log'),
      readLogFile('combined.log')
    ]);
    
    const allLogs = [...combinedLogs, ...errorLogs];
    
    // Calculate total requests (assuming logs with method field are HTTP requests)
    const httpLogs = allLogs.filter(log => log.method);
    const totalRequests = httpLogs.length;
    
    // Calculate error rate
    const errorCount = allLogs.filter(log => 
      log.level === 'error' || (log.statusCode && log.statusCode >= 400)
    ).length;
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
    
    // Calculate average response time
    const logsWithDuration = httpLogs.filter(log => log.duration);
    const averageResponseTime = logsWithDuration.length > 0 
      ? logsWithDuration.reduce((sum, log) => sum + (log.duration || 0), 0) / logsWithDuration.length
      : 0;
    
    // Get top endpoints
    const endpointCounts = new Map<string, number>();
    httpLogs.forEach(log => {
      if (log.url) {
        const endpoint = `${log.method} ${log.url}`;
        endpointCounts.set(endpoint, (endpointCounts.get(endpoint) || 0) + 1);
      }
    });
    
    const topEndpoints = Array.from(endpointCounts.entries())
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Get recent errors (last 24 hours)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentErrors = allLogs
      .filter(log => 
        (log.level === 'error' || (log.statusCode && log.statusCode >= 400)) &&
        new Date(log.timestamp) >= last24h
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);

    // Additional stats
    const stats = {
      totalRequests,
      errorRate: Math.round(errorRate * 100) / 100, // Round to 2 decimal places
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      topEndpoints,
      recentErrors,
      // Additional detailed stats
      total: allLogs.length,
      byLevel: {} as Record<string, number>,
      byMethod: {} as Record<string, number>,
      recent: {
        last24h: 0,
        last7days: 0,
        last30days: 0
      }
    };

    const now = new Date();
    const last7days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    allLogs.forEach(log => {
      // Count by level
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
      
      // Count by method
      if (log.method) {
        stats.byMethod[log.method] = (stats.byMethod[log.method] || 0) + 1;
      }

      // Count recent logs
      const logDate = new Date(log.timestamp);
      if (logDate >= last24h) stats.recent.last24h++;
      if (logDate >= last7days) stats.recent.last7days++;
      if (logDate >= last30days) stats.recent.last30days++;
    });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching log stats:', error);
    res.status(500).json({ error: 'Failed to fetch log statistics' });
  }
});

export default router;

// In your server.js, import like this:
// import logsRouter from './routes/logs.js'
// app.use('/api/logs', authenticateToken, logsRouter) // Add auth middleware