import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';

/**
 * Representa una entrada de log en operaciones masivas.
 * Extiende de `LogEntry` y puede incluir un `timestamp`.
 */
export interface BulkLogEntry extends LogEntry {
  /** Fecha y hora opcional del evento */
  timestamp?: Date;
}

/**
 * Configuración para archivos de log en almacenamiento.
 *
 * 🔹 Se usa para definir dónde y cómo se guardan los logs.
 * - `containerName`: contenedor en el que se almacenan los logs.
 * - `directory`: ruta del directorio dentro del contenedor.
 * - `maxFileSize`: tamaño máximo del archivo en MB antes de rotar.
 * - `rotateDaily`: si `true`, rota los archivos de log diariamente.
 * - `dynamicColumns`: habilita columnas dinámicas en el log.
 * - `fileType`: formato de archivo (por ejemplo, CSV o JSON).
 */
export interface LogFileConfig {
  containerName?: string;
  directory?: string;
  maxFileSize?: number;
  rotateDaily?: boolean;
  dynamicColumns?: boolean;
  fileType?: LogFileType;
}
