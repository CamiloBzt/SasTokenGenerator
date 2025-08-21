import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Filtro global para manejar excepciones HTTP en la aplicación.
 *
 * 📌 Captura las excepciones que extienden de `HttpException`
 * y estandariza la respuesta enviada al cliente.
 *
 * 🔹 Formato de respuesta:
 * {
 *   status: {
 *     statusCode: number,          // Código de estado HTTP
 *     statusDescription: string    // Descripción del error
 *   }
 * }
 *
 * 🔹 Si la excepción incluye `statusDescription`, se utiliza.
 * De lo contrario, se retorna el mensaje por defecto de la excepción.
 *
 * Ejemplo:
 * throw new BadRequestException('Parámetros inválidos');
 *
 * Respuesta:
 * {
 *   "status": {
 *     "statusCode": 400,
 *     "statusDescription": "Solicitud inválida o mal formada."
 *   }
 * }
 */
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
