import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception.getResponse();

    const statusDescription =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'statusDescription' in exceptionResponse
        ? (exceptionResponse as Record<string, any>).statusDescription
        : exception.message;

    const errorResponsePor = {
      status: {
        statusCode: status,
        statusDescription,
      },
    };

    response.status(status).json(errorResponsePor);
  }
}
