import { Injectable } from '@nestjs/common';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import { BulkLogEntry } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogFormatter } from '@src/shared/interfaces/services/blob-logging/log-formatter.interface';

/**
 * @fileoverview
 * Implementación de {@link LogFormatter} para **logs tradicionales** en texto plano (`.log`).
 *
 * Formato de línea resultante:
 * ```
 * [ISO_TIMESTAMP] [LEVEL] [REQUEST_ID?] [User:USER_ID?] [Session:SESSION_ID?] MESSAGE | Metadata: {...}?
 * ```
 *
 * - Incluye campos opcionales: `requestId`, `userId`, `sessionId`.
 * - Serializa `metadata` como JSON al final de la línea si existe.
 * - Cada entrada termina con salto de línea.
 *
 * @module sas/services/blob-logging/formatters/traditional-log-formatter
 */
@Injectable()
export class TraditionalLogFormatter implements LogFormatter {
  /**
   * Da formato a una entrada de log como una línea de texto plano.
   *
   * @param {LogEntry} entry - Entrada de log a formatear.
   * @param {Date} [timestamp] - Timestamp a usar; si no se provee, se usa `new Date()`.
   * @returns {string} Línea formateada con salto de línea.
   *
   * @example
   * formatter.formatEntry({
   *   level: 'INFO',
   *   message: 'Login ok',
   *   userId: '42',
   *   requestId: 'req-abc',
   *   metadata: { ip: '127.0.0.1' }
   * });
   * // => "[2025-08-19T12:00:00.000Z] [INFO] [req-abc] [User:42] Login ok | Metadata: {\"ip\":\"127.0.0.1\"}\n"
   */
  formatEntry(entry: LogEntry, timestamp?: Date): string {
    const logTimestamp = timestamp
      ? timestamp.toISOString()
      : new Date().toISOString();

    let logLine = `[${logTimestamp}] [${entry.level}]`;

    if (entry.requestId) {
      logLine += ` [${entry.requestId}]`;
    }

    if (entry.userId) {
      logLine += ` [User:${entry.userId}]`;
    }

    if (entry.sessionId) {
      logLine += ` [Session:${entry.sessionId}]`;
    }

    logLine += ` ${entry.message}`;

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      logLine += ` | Metadata: ${JSON.stringify(entry.metadata)}`;
    }

    return logLine + '\n';
  }

  /**
   * Formatea múltiples entradas concatenando cada línea producida por {@link formatEntry}.
   *
   * @param {BulkLogEntry[]} entries - Entradas a formatear (con `timestamp` opcional por cada una).
   * @returns {string} Bloque de texto con todas las líneas.
   *
   * @example
   * formatter.formatBulkEntries([
   *   { level: 'INFO', message: 'a', timestamp: new Date() },
   *   { level: 'ERROR', message: 'b' }
   * ]);
   */
  formatBulkEntries(entries: BulkLogEntry[]): string {
    return entries
      .map((entry) => this.formatEntry(entry, entry.timestamp))
      .join('');
  }

  /**
   * Indica si el formato soporta **append** (agregar líneas a un archivo existente).
   * @returns {boolean} Siempre `true` para texto plano.
   */
  supportsAppend(): boolean {
    return true;
  }

  /**
   * Valida que una entrada tenga los campos mínimos requeridos.
   * Requiere `level` y `message`.
   *
   * @param {LogEntry} entry - Entrada de log.
   * @returns {boolean} `true` si es válida; `false` en caso contrario.
   */
  validateEntry(entry: LogEntry): boolean {
    return !!(entry.level && entry.message);
  }
}
