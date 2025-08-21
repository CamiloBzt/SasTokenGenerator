import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Niveles de severidad para los logs.
 *
 * Usado para clasificar la importancia o criticidad de un evento.
 *
 * - `DEBUG` → Información de depuración detallada.
 * - `INFO` → Eventos informativos (flujo normal).
 * - `WARN` → Advertencias que no detienen la ejecución.
 * - `ERROR` → Errores que afectan parcialmente la operación.
 * - `FATAL` → Fallos críticos que detienen el proceso.
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

/**
 * Tipos de archivo de log soportados.
 *
 * - `LOG` → Texto plano tradicional.
 * - `CSV` → Formato tabular para análisis y compatibilidad con Excel.
 * - `XLSX` → Formato avanzado de Excel con hojas y estilos.
 */
export enum LogFileType {
  LOG = 'log',
  CSV = 'csv',
  XLSX = 'xlsx',
}

/**
 * DTO que representa una entrada individual de log.
 *
 * Contiene nivel, mensaje y metadatos opcionales.
 */
export class LogEntryDto {
  /** Nivel de severidad del log. */
  @ApiProperty({
    enum: LogLevel,
    description: 'Nivel de log',
    example: LogLevel.INFO,
  })
  level: LogLevel;

  /** Mensaje descriptivo del evento registrado. */
  @ApiProperty({
    description: 'Mensaje del log',
    example: 'Usuario completó la operación exitosamente',
  })
  message: string;

  /** Metadatos adicionales en formato JSON (ej. operación, tamaño de archivo, duración). */
  @ApiPropertyOptional({
    description: 'Metadatos adicionales en formato JSON',
    example: { operation: 'upload', fileSize: 1024, duration: 250 },
  })
  metadata?: Record<string, any>;

  /** ID del usuario que generó el log. */
  @ApiPropertyOptional({
    description: 'ID del usuario que ejecuta la operación',
    example: 'user123',
  })
  userId?: string;

  /** ID de sesión asociada. */
  @ApiPropertyOptional({
    description: 'ID de sesión',
    example: 'session-abc-123',
  })
  sessionId?: string;

  /** ID de request (útil para trazabilidad distribuida). */
  @ApiPropertyOptional({
    description: 'ID de request para traceabilidad',
    example: 'req-xyz-789',
  })
  requestId?: string;
}

/**
 * Configuración opcional de un archivo de log.
 *
 * Permite controlar contenedor, directorio, rotación y tipo de archivo.
 */
export class LogFileConfigDto {
  /** Nombre del contenedor donde se almacenan los logs. */
  @ApiPropertyOptional({
    description: 'Nombre del contenedor de logs',
    example: 'application-logs',
    default: 'logs',
  })
  containerName?: string;

  /** Directorio lógico dentro del contenedor. */
  @ApiPropertyOptional({
    description: 'Directorio dentro del contenedor',
    example: 'api/2024',
    default: 'application',
  })
  directory?: string;

  /** Tamaño máximo en MB antes de rotar automáticamente el archivo. */
  @ApiPropertyOptional({
    description: 'Tamaño máximo del archivo en MB antes de rotar',
    example: 100,
    default: 100,
  })
  maxFileSize?: number;

  /** Indica si los archivos deben rotarse diariamente. */
  @ApiPropertyOptional({
    description: 'Si debe rotar archivos diariamente',
    example: true,
    default: true,
  })
  rotateDaily?: boolean;

  /** Tipo de archivo de log a usar (log, csv, xlsx, etc.). */
  @ApiPropertyOptional({
    description: 'Tipo de archivo de log (log, csv, xlsx, etc)',
    enum: LogFileType,
    example: LogFileType.LOG,
    default: LogFileType.LOG,
  })
  fileType?: LogFileType;

  /**
   * Define si se deben usar SOLO columnas dinámicas basadas en metadata.
   *
   * ⚠️ Nota: Aplica únicamente para CSV/XLSX. Ignora campos como `timestamp`, `level`, etc.
   */
  @ApiPropertyOptional({
    description:
      'Usar SOLO columnas dinámicas basadas en metadata (ignora campos del sistema como timestamp, level, etc. - solo para CSV/XLSX)',
    example: true,
    default: false,
  })
  dynamicColumns?: boolean;
}

/**
 * DTO para agregar una entrada de log individual a un archivo.
 */
export class AppendLogDto {
  /** Nombre base del archivo de log. */
  @ApiProperty({
    description: 'Nombre base del archivo de log',
    example: 'api-operations',
  })
  fileName: string;

  /** Entrada de log que se va a agregar. */
  @ApiProperty({
    type: LogEntryDto,
    description: 'Entrada de log a agregar',
  })
  entry: LogEntryDto;

  /** Configuración opcional del archivo de log. */
  @ApiPropertyOptional({
    type: LogFileConfigDto,
    description: 'Configuración opcional del archivo de log',
  })
  config?: LogFileConfigDto;
}

/**
 * DTO para una entrada de log en operaciones bulk (masivas).
 *
 * Extiende LogEntryDto y permite timestamp personalizado.
 */
export class BulkLogEntryDto extends LogEntryDto {
  /** Timestamp ISO personalizado (por defecto, se usa la hora actual del sistema). */
  @ApiPropertyOptional({
    description: 'Timestamp personalizado para la entrada (ISO string)',
    example: '2024-07-11T16:30:00.000Z',
  })
  timestamp?: string;
}

/**
 * DTO para agregar múltiples logs en una sola operación (bulk append).
 */
export class AppendBulkLogsDto {
  /** Nombre base del archivo de log. */
  @ApiProperty({
    description: 'Nombre base del archivo de log',
    example: 'batch-operations',
  })
  fileName: string;

  /** Conjunto de entradas de log a agregar. */
  @ApiProperty({
    type: [BulkLogEntryDto],
    description: 'Array de entradas de log a agregar',
  })
  entries: BulkLogEntryDto[];

  /** Configuración opcional del archivo de log. */
  @ApiPropertyOptional({
    type: LogFileConfigDto,
    description: 'Configuración opcional del archivo de log',
  })
  config?: LogFileConfigDto;
}

/**
 * DTO para leer logs desde un archivo existente.
 */
export class ReadLogsDto {
  /** Nombre base del archivo de log a leer. */
  @ApiProperty({
    description: 'Nombre base del archivo de log a leer',
    example: 'api-operations',
  })
  fileName: string;

  /** Configuración opcional del archivo de log. */
  @ApiPropertyOptional({
    type: LogFileConfigDto,
    description: 'Configuración opcional del archivo de log',
  })
  config?: LogFileConfigDto;
}

/**
 * DTO para obtener estadísticas de un archivo de log.
 */
export class GetLogStatsDto {
  /** Nombre base del archivo de log. */
  @ApiProperty({
    description: 'Nombre base del archivo de log',
    example: 'api-operations',
  })
  fileName: string;

  /** Configuración opcional del archivo de log. */
  @ApiPropertyOptional({
    type: LogFileConfigDto,
    description: 'Configuración opcional del archivo de log',
  })
  config?: LogFileConfigDto;
}
