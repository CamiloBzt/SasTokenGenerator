import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ApiSuccessResponse } from './swagger-responses.decorator';

/**
 * Documenta las posibles respuestas de error comunes en operaciones de logging.
 *
 * Incluye:
 * - **400 BAD_REQUEST** → Errores de validación o configuración (nivel inválido, nombre de archivo faltante, configuración incorrecta).
 * - **500 INTERNAL_SERVER_ERROR** → Errores internos al acceder al contenedor de logs o generar tokens SAS.
 *
 * @example
 * ```ts
 * @Post('append')
 * @ApiLoggingErrorResponses()
 * async appendLog() {}
 * ```
 */
export function ApiLoggingErrorResponses() {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Logging operation errors',
      schema: {
        examples: {
          invalidLogLevel: {
            summary: 'Nivel de log inválido',
            value: {
              status: {
                statusCode: 400,
                statusDescription:
                  'Nivel de log inválido. Niveles permitidos: DEBUG, INFO, WARN, ERROR, FATAL',
              },
            },
          },
          fileNameMissing: {
            summary: 'Nombre de archivo faltante',
            value: {
              status: {
                statusCode: 400,
                statusDescription: 'El nombre del archivo es requerido',
              },
            },
          },
          configurationError: {
            summary: 'Error de configuración',
            value: {
              status: {
                statusCode: 400,
                statusDescription:
                  'Configuración inválida: maxFileSize debe ser mayor a 0',
              },
            },
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      description: 'Internal server errors',
      schema: {
        examples: {
          storageError: {
            summary: 'Error de almacenamiento',
            value: {
              status: {
                statusCode: 500,
                statusDescription: 'Error al acceder al contenedor de logs',
              },
            },
          },
          sasError: {
            summary: 'Error de SAS token',
            value: {
              status: {
                statusCode: 500,
                statusDescription: 'Error generando token SAS para logging',
              },
            },
          },
        },
      },
    }),
  );
}

/**
 * Documenta la operación de agregar una entrada de log individual a un append blob.
 *
 * - Crea el archivo si no existe.
 * - Útil para registrar eventos puntuales: transacciones, acciones de usuario, errores específicos.
 *
 * @example
 * ```ts
 * @Post('append')
 * @ApiAppendLogOperation()
 * async appendLog(@Body() dto: AppendLogDto) {}
 * ```
 */
export function ApiAppendLogOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Agregar entrada de log individual',
      description: `
        Agrega una entrada de log al archivo de append blob especificado.
        Ideal para registrar eventos individuales como transacciones bancarias,
        operaciones de usuario, errores específicos, etc.
        El archivo se crea automáticamente si no existe.
      `,
    }),
    ApiSuccessResponse('Log agregado exitosamente', {
      status: {
        statusCode: 200,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        message: 'Log entry added successfully',
        fileName: 'banking-transfers-2024-07-11.log',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      },
    }),
    ApiLoggingErrorResponses(),
  );
}

/**
 * Documenta la operación de agregar múltiples entradas de log en lote.
 *
 * - Inserta todas las entradas en una sola operación.
 * - Ideal para flujos completos de transacciones o procesos batch.
 * - Garantiza atomicidad de escritura.
 *
 * @example
 * ```ts
 * @Post('bulk')
 * @ApiBulkLogOperation()
 * async bulkLogs(@Body() dto: BulkLogDto) {}
 * ```
 */
export function ApiBulkLogOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Agregar múltiples entradas de log',
      description: `
        Agrega múltiples entradas de log al archivo en una sola operación.
        Perfecto para registrar flujos completos de transacciones,
        operaciones batch, o cuando necesitas garantizar que todas
        las entradas se escriban juntas de forma atómica.
      `,
    }),
    ApiSuccessResponse('Logs en lote agregados exitosamente', {
      status: {
        statusCode: 200,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        message: 'Bulk log entries added successfully',
        fileName: 'transaction-flows',
        entriesCount: 4,
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      },
    }),
    ApiLoggingErrorResponses(),
  );
}

/**
 * Documenta la operación de lectura completa de un archivo de log.
 *
 * - Devuelve todo el contenido del archivo.
 * - Útil para auditorías, debugging o análisis post-mortem.
 * ⚠️ Recomendado usar con precaución en archivos grandes.
 *
 * @example
 * ```ts
 * @Get('read')
 * @ApiReadLogOperation()
 * async readLog(@Query('fileName') fileName: string) {}
 * ```
 */
export function ApiReadLogOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Leer archivo completo de log',
      description: `
        Lee el contenido completo de un archivo de log.
        Útil para auditorías, análisis post-mortem, debugging,
        o cuando necesitas extraer información específica.
        ⚠️ Usar con cuidado en archivos grandes.
      `,
    }),
    ApiSuccessResponse('Contenido del log leído exitosamente', {
      status: {
        statusCode: 200,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        content:
          '[2024-07-11T10:00:00.000Z] [INFO] [TXN789123] Transferencia completada...',
        fileName: 'banking-transfers-2024-07-11.log',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      },
    }),
    ApiLoggingErrorResponses(),
  );
}

/**
 * Documenta la operación de consulta de estadísticas de un archivo de log.
 *
 * Devuelve:
 * - Tamaño en bytes y MB.
 * - Fechas de creación y última modificación.
 * - Estado de existencia del archivo.
 *
 * @example
 * ```ts
 * @Get('stats')
 * @ApiLogStatsOperation()
 * async getLogStats(@Query('fileName') fileName: string) {}
 * ```
 */
export function ApiLogStatsOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Obtener estadísticas del archivo de log',
      description: `
        Obtiene información detallada sobre un archivo de log específico.
        Incluye tamaño en bytes y MB, fechas de creación y modificación,
        y estado de existencia. Útil para monitoreo, gestión de espacio
        y análisis de crecimiento de logs.
      `,
    }),
    ApiSuccessResponse('Estadísticas obtenidas exitosamente', {
      status: {
        statusCode: 200,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        exists: true,
        sizeBytes: 1048576,
        sizeMB: 1.0,
        lastModified: '2024-07-11T16:30:00.000Z',
        createdAt: '2024-07-11T08:00:00.000Z',
        fileName: 'banking-transfers-2024-07-11.log',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      },
    }),
    ApiLoggingErrorResponses(),
  );
}
