import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/errors';

export const errorHandler = (
  error: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response | void => {
  console.error('Error:', error);

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.message,
    });
  }

  if (error instanceof SyntaxError) {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON',
    });
  }

  if (error instanceof z.ZodError) {
    return res.status(400).json({
      success: false,
      error: error.issues[0]?.message || 'Invalid request data',
    });
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
};

export const notFoundHandler = (
  _req: Request,
  res: Response
): Response | void => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
};