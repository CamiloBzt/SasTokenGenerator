import { HttpException } from '@nestjs/common';
import { HttpResponseMessages } from '../enums/http-response-messages.enum';
import { HttpStatusCodes } from '../enums/http-status-codes.enum';

/**
 * Excepción personalizada para manejar errores de tipo "Bad Request" (400).
 *
 * 🚨 Se lanza cuando la solicitud es inválida o contiene datos malformados.
 *
 * Estructura de la respuesta:
 * {
 *   statuscode: 400,                          // Código HTTP
 *   type: 'ERROR',                            // Tipo de mensaje
 *   statusDescription: 'Solicitud inválida...',// Descripción general
 *   errorMessage: string                       // Detalle específico del error
 * }
 *
 * Ejemplo de uso:
 * throw new BadRequestException('El campo email es obligatorio');
 */
export class BadRequestException extends HttpException {
  constructor(errorMessage: string) {
    super(
      {
        statuscode: HttpStatusCodes.BAD_REQUEST,
        type: 'ERROR',
        statusDescription: HttpResponseMessages.BAD_REQUEST,
        errorMessage,
      },
      HttpStatusCodes.BAD_REQUEST,
    );
  }
}
