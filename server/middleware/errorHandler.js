import { logger } from '../utils/logger.js';

export const errorHandler = (error, request, reply) => {
  const { method, url, ip } = request;
  
  // Log the error
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    method,
    url,
    ip,
    body: request.body,
    query: request.query
  });

  // Handle different error types
  if (error.validation) {
    // Joi validation errors
    return reply.status(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
      details: error.validation
    });
  }

  if (error.code === '23505') {
    // PostgreSQL unique violation
    return reply.status(409).send({
      error: 'Conflict',
      message: 'Resource already exists'
    });
  }

  if (error.code === '23503') {
    // PostgreSQL foreign key violation
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Referenced resource does not exist'
    });
  }

  if (error.statusCode) {
    // Known HTTP errors
    return reply.status(error.statusCode).send({
      error: error.name || 'Error',
      message: error.message
    });
  }

  // Default server error
  return reply.status(500).send({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong' 
      : error.message
  });
};

// Custom error classes
export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}
