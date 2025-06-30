import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import logger from '@/config/logger';

export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Validation failed:', {
      errors: errors.array(),
      body: req.body,
      ip: req.ip,
    });
    
    res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
    });
    return;
  }
  
  next();
};