import { HttpException } from '@nestjs/common';
import { HttpResponseMessages } from '../enums/http-response-messages.enum';
import { HttpStatusCodes } from '../enums/http-status-codes.enum';

/**
 * Excepción personalizada para manejar errores de negocio (206).
 *
 * 🚨 Se usa cuando la solicitud es válida, pero ocurre una condición
 * propia de la lógica de negocio que impide completar la operación.
 *
 * Estructura de la respuesta:
 * {
 *   statuscode: 206,                         // Código HTTP definido para errores de negocio
 *   type: 'ERROR',                           // Tipo de mensaje
 *   statusDescription: 'Error de negocio.',  // Descripción general
 *   errorMessage: string                     // Detalle específico del error
 * }
 *
 * Ejemplo de uso:
 * throw new BusinessErrorException('El usuario ya tiene una suscripción activa');
 */
export class BusinessErrorException extends HttpException {
  constructor(errorMessage: string) {
    super(
      {
        statuscode: HttpStatusCodes.BUSINESS_ERROR,
        type: 'ERROR',
        statusDescription: HttpResponseMessages.BUSINESS_ERROR,
        errorMessage,
      },
      HttpStatusCodes.BUSINESS_ERROR,
    );
  }
}
