import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

export enum LogFileType {
  LOG = 'log',
  CSV = 'csv',
  XLSX = 'xlsx',
}

export class LogEntryDto {
  @ApiProperty({
    enum: LogLevel,
    description: 'Nivel de log',
    example: LogLevel.INFO,
  })
  level: LogLevel;

  @ApiProperty({
    description: 'Mensaje del log',
    example: 'Usuario completó la operación exitosamente',
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Metadatos adicionales en formato JSON',
    example: { operation: 'upload', fileSize: 1024, duration: 250 },
  })
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'ID del usuario que ejecuta la operación',
    example: 'user123',
  })
  userId?: string;

  @ApiPropertyOptional({
    description: 'ID de sesión',
    example: 'session-abc-123',
  })
  sessionId?: string;

  @ApiPropertyOptional({
    description: 'ID de request para traceabilidad',
    example: 'req-xyz-789',
  })
  requestId?: string;
}

export class LogFileConfigDto {
  @ApiPropertyOptional({
    description: 'Nombre del contenedor de logs',
    example: 'application-logs',
    default: 'logs',
  })
  containerName?: string;

  @ApiPropertyOptional({
    description: 'Directorio dentro del contenedor',
    example: 'api/2024',
    default: 'application',
  })
  directory?: string;

  @ApiPropertyOptional({
    description: 'Tamaño máximo del archivo en MB antes de rotar',
    example: 100,
    default: 100,
  })
  maxFileSize?: number;

  @ApiPropertyOptional({
    description: 'Si debe rotar archivos diariamente',
    example: true,
    default: true,
  })
  rotateDaily?: boolean;

  @ApiPropertyOptional({
    description: 'Tipo de archivo de log (log, csv, xlsx, etc)',
    enum: LogFileType,
    example: LogFileType.LOG,
    default: LogFileType.LOG,
  })
  fileType?: LogFileType;

  @ApiPropertyOptional({
    description:
      'Usar SOLO columnas dinámicas basadas en metadata (ignora campos del sistema como timestamp, level, etc. - solo para CSV/XLSX)',
    example: true,
    default: false,
  })
  dynamicColumns?: boolean;
}

export class AppendLogDto {
  @ApiProperty({
    description: 'Nombre base del archivo de log',
    example: 'api-operations',
  })
  fileName: string;

  @ApiProperty({
    type: LogEntryDto,
    description: 'Entrada de log a agregar',
  })
  entry: LogEntryDto;

  @ApiPropertyOptional({
    type: LogFileConfigDto,
    description: 'Configuración opcional del archivo de log',
  })
  config?: LogFileConfigDto;
}

export class BulkLogEntryDto extends LogEntryDto {
  @ApiPropertyOptional({
    description: 'Timestamp personalizado para la entrada (ISO string)',
    example: '2024-07-11T16:30:00.000Z',
  })
  timestamp?: string;
}

export class AppendBulkLogsDto {
  @ApiProperty({
    description: 'Nombre base del archivo de log',
    example: 'batch-operations',
  })
  fileName: string;

  @ApiProperty({
    type: [BulkLogEntryDto],
    description: 'Array de entradas de log a agregar',
  })
  entries: BulkLogEntryDto[];

  @ApiPropertyOptional({
    type: LogFileConfigDto,
    description: 'Configuración opcional del archivo de log',
  })
  config?: LogFileConfigDto;
}

export class ReadLogsDto {
  @ApiProperty({
    description: 'Nombre base del archivo de log a leer',
    example: 'api-operations',
  })
  fileName: string;

  @ApiPropertyOptional({
    type: LogFileConfigDto,
    description: 'Configuración opcional del archivo de log',
  })
  config?: LogFileConfigDto;
}

export class GetLogStatsDto {
  @ApiProperty({
    description: 'Nombre base del archivo de log',
    example: 'api-operations',
  })
  fileName: string;

  @ApiPropertyOptional({
    type: LogFileConfigDto,
    description: 'Configuración opcional del archivo de log',
  })
  config?: LogFileConfigDto;
}
