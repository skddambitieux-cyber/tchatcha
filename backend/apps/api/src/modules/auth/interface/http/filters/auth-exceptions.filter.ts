/**
 * TCHATCHA — Filtre d'exceptions du module auth.
 * Mappe les erreurs métier (code + httpStatus, auth-errors.ts) vers
 * l'enveloppe d'erreur du blueprint (§5) et le tableau §9 de
 * docs/27-api-contracts-auth.md. `Retry-After` posé pour 429/423.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface DomainErrorShape {
  code: string;
  httpStatus: number;
  message: string;
  retryAfterSeconds?: number;
  attemptsLeft?: number;
}

function isDomainError(err: unknown): err is DomainErrorShape {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { code?: unknown }).code === 'string' &&
    typeof (err as { httpStatus?: unknown }).httpStatus === 'number'
  );
}

@Catch()
export class AuthExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AuthExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    // Erreurs métier auth → enveloppe du blueprint (§9).
    if (isDomainError(exception)) {
      const status = exception.httpStatus;
      const body: Record<string, unknown> = {
        status: 'error',
        code: exception.code,
        message: exception.message,
      };
      if (exception.retryAfterSeconds !== undefined) {
        body.retry_after = exception.retryAfterSeconds;
      }
      if (exception.attemptsLeft !== undefined) {
        body.details = [
          {
            field: 'code',
            reason: 'wrong_code',
            meta: { attempts_left: exception.attemptsLeft },
          },
        ];
      }
      if ([HttpStatus.TOO_MANY_REQUESTS, HttpStatus.LOCKED].includes(status)) {
        res.setHeader('Retry-After', String(exception.retryAfterSeconds ?? 45));
      }
      res.status(status).json(body);
      return;
    }

    // HttpException standard (404 route, validation 400…) → réponse NestJS par défaut.
    if (exception instanceof HttpException) {
      res
        .status(exception.getStatus())
        .json(
          typeof exception.getResponse() === 'string'
            ? { statusCode: exception.getStatus(), message: exception.getResponse() }
            : exception.getResponse(),
        );
      return;
    }

    // Ne jamais journaliser message/stack ici : une erreur d'infrastructure
    // peut embarquer une URL signée, un token ou des paramètres SQL sensibles.
    const errorType = exception instanceof Error
      ? exception.name
      : typeof exception;
    const errorCode =
      typeof exception === 'object' && exception !== null &&
      typeof (exception as { code?: unknown }).code === 'string'
        ? (exception as { code: string }).code
        : 'unknown';
    this.logger.error(`Unhandled exception type=${errorType} code=${errorCode}`);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'error',
      code: 'internal_error',
      message: 'Erreur interne du serveur',
    });
  }
}
