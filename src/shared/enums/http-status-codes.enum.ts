/**
 * Códigos de estado HTTP usados en las respuestas de la API.
 *
 * Referencia rápida:
 * | Código | Nombre                | Significado                               |
 * |--------|-----------------------|-------------------------------------------|
 * | 200    | OK                    | Operación exitosa                         |
 * | 201    | CREATED               | Recurso creado correctamente              |
 * | 202    | ACCEPTED              | Solicitud aceptada para procesamiento     |
 * | 204    | NO_CONTENT            | Operación exitosa sin contenido           |
 * | 206    | BUSINESS_ERROR        | Error de negocio                          |
 * | 400    | BAD_REQUEST           | Solicitud inválida o mal formada          |
 * | 401    | UNAUTHORIZED          | Requiere autenticación                    |
 * | 403    | FORBIDDEN             | Acceso denegado                           |
 * | 404    | NOT_FOUND             | Recurso no encontrado                     |
 * | 405    | METHOD_NOT_ALLOWED    | Método no permitido                       |
 * | 500    | INTERNAL_SERVER_ERROR | Error interno del servidor                |
 * | 501    | NOT_IMPLEMENTED       | Funcionalidad no implementada             |
 * | 503    | SERVICE_UNAVAILABLE   | Servicio temporal no disponible           |
 */
export enum HttpStatusCodes {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  BUSINESS_ERROR = 206,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  SERVICE_UNAVAILABLE = 503,
}
