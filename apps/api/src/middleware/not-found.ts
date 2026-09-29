import type { RequestHandler } from 'express';
import { AppError } from '../lib/app-error.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`));
};
