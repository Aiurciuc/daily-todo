import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '@prisma/client';

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientRustPanicError,
  Prisma.PrismaClientValidationError,
)
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DatabaseExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: Error, host: ArgumentsHost): void {
    let status = HttpStatus.SERVICE_UNAVAILABLE;
    let message = 'Database unavailable';
    let error = 'Service Unavailable';
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Task not found';
        error = 'Not Found';
      } else if (exception.code === 'P2034' || exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'Tasks changed. Reload and try again.';
        error = 'Conflict';
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'Internal Server Error';
    }
    // Log classification only: driver messages may contain credentials or SQL.
    this.logger.warn(`Database request failed (${exception.name}, status ${status})`);
    this.adapterHost.httpAdapter.reply(
      host.switchToHttp().getResponse(),
      { statusCode: status, message, error },
      status,
    );
  }
}
