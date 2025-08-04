import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ApiSuccessResponse } from './swagger-responses.decorator';

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

// Función helper para descripciones de niveles de log
function getLogLevelDescription(level: string): string {
  const descriptions = {
    DEBUG:
      'Para información detallada de debugging y desarrollo. Solo usar en entornos de desarrollo.',
    INFO: 'Para operaciones normales y exitosas. El nivel estándar para operaciones de negocio.',
    WARN: 'Para situaciones que requieren atención pero no son errores críticos.',
    ERROR:
      'Para errores que afectan operaciones específicas pero no el sistema completo.',
    FATAL:
      'Para errores críticos que pueden afectar la disponibilidad del sistema completo.',
  };

  return descriptions[level] || 'Nivel de log personalizado.';
}
