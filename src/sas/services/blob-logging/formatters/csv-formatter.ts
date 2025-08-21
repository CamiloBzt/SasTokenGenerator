import { Injectable } from '@nestjs/common';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import { BulkLogEntry } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogFormatter } from '@src/shared/interfaces/services/blob-logging/log-formatter.interface';

/**
 * @fileoverview
 * Implementación de {@link LogFormatter} para generar logs en formato **CSV**.
 *
 * - Soporta dos modos de operación:
 *   1. **Estático**: Usa un conjunto fijo de columnas predefinidas.
 *   2. **Dinámico**: Genera las columnas a partir de las claves en `metadata`.
 *
 * - Incluye escape de campos según reglas CSV (comillas, comas, saltos de línea).
 * - Permite resetear el modo dinámico entre sesiones de escritura.
 *
 * @module sas/services/blob-logging/formatters/csv-formatter
 */
@Injectable()
export class CsvLogFormatter implements LogFormatter {
  /**
   * Encabezados por defecto cuando no se usa modo dinámico.
   */
  private readonly DEFAULT_CSV_HEADERS = [
    'timestamp',
    'level',
    'requestId',
    'userId',
    'sessionId',
    'message',
    'metadata',
  ];

  /**
   * Cache de encabezados dinámicos construidos a partir de `metadata`.
   */
  private cachedDynamicHeaders: string[] | null = null;

  /**
   * Flag para indicar si se está usando modo dinámico.
   */
  private isDynamicMode = false;

  /**
   * Genera la cabecera (header) para el archivo CSV.
   *
   * - Si se activa `isDynamic` y se provee `sampleEntry` con `metadata`,
   *   construye columnas dinámicas basadas en las claves de `metadata`.
   * - Caso contrario, usa las cabeceras por defecto (`DEFAULT_CSV_HEADERS`).
   *
   * @param {boolean} [isDynamic] - Indica si usar cabeceras dinámicas.
   * @param {LogEntry} [sampleEntry] - Entrada de ejemplo para extraer claves de `metadata`.
   * @returns {string} Cadena CSV con cabeceras y salto de línea al final.
   *
   * @example
   * formatter.formatHeader();
   * // "timestamp,level,requestId,userId,sessionId,message,metadata\n"
   *
   * formatter.formatHeader(true, { metadata: { action: 'login', ip: '127.0.0.1' }});
   * // "action,ip\n"
   */
  formatHeader(isDynamic?: boolean, sampleEntry?: LogEntry): string {
    this.isDynamicMode = isDynamic || false;

    if (this.isDynamicMode && sampleEntry?.metadata) {
      const metadataKeys = Object.keys(sampleEntry.metadata);
      this.cachedDynamicHeaders = [...metadataKeys];

      return this.cachedDynamicHeaders.join(',') + '\n';
    }

    return this.DEFAULT_CSV_HEADERS.join(',') + '\n';
  }

  /**
   * Da formato a una única entrada de log en CSV.
   *
   * - En modo dinámico: Solo serializa los valores de `metadata` en el orden cacheado.
   * - En modo estático: Usa campos fijos (`timestamp`, `level`, `requestId`, etc.).
   *
   * @param {LogEntry} entry - Entrada de log.
   * @param {Date} [timestamp] - Marca de tiempo opcional; si no se da, usa `new Date()`.
   * @returns {string} Línea CSV correspondiente a la entrada.
   */
  formatEntry(entry: LogEntry, timestamp?: Date): string {
    const logTimestamp = timestamp
      ? timestamp.toISOString()
      : new Date().toISOString();

    if (this.isDynamicMode && this.cachedDynamicHeaders && entry.metadata) {
      const metadataValues = this.cachedDynamicHeaders.map((key) => {
        const value = entry.metadata?.[key];
        return value !== undefined ? this.escapeCsvField(String(value)) : '';
      });

      return metadataValues.join(',') + '\n';
    }

    const fields = [
      logTimestamp,
      entry.level,
      entry.requestId || '',
      entry.userId || '',
      entry.sessionId || '',
      this.escapeCsvField(entry.message),
      entry.metadata ? this.escapeCsvField(JSON.stringify(entry.metadata)) : '',
    ];

    return fields.join(',') + '\n';
  }

  /**
   * Formatea múltiples entradas de log en un solo bloque CSV.
   *
   * @param {BulkLogEntry[]} entries - Lista de entradas de log con timestamps opcionales.
   * @returns {string} Cadena CSV con todas las entradas concatenadas.
   */
  formatBulkEntries(entries: BulkLogEntry[]): string {
    return entries
      .map((entry) => this.formatEntry(entry, entry.timestamp))
      .join('');
  }

  /**
   * Indica si el formato soporta **append** (agregar nuevas líneas al archivo existente).
   *
   * @returns {boolean} Siempre `true` en CSV.
   */
  supportsAppend(): boolean {
    return true;
  }

  /**
   * Valida que una entrada de log sea válida para el formato CSV.
   *
   * Requisitos mínimos:
   * - `level` definido.
   * - `message` definido.
   *
   * @param {LogEntry} entry - Entrada de log.
   * @returns {boolean} `true` si es válida; `false` en caso contrario.
   */
  validateEntry(entry: LogEntry): boolean {
    return !!(entry.level && entry.message);
  }

  /**
   * Reinicia el modo dinámico eliminando headers cacheados.
   */
  resetDynamicMode(): void {
    this.cachedDynamicHeaders = null;
    this.isDynamicMode = false;
  }

  /**
   * Retorna las cabeceras actualmente en uso.
   *
   * - Si se está en modo dinámico, devuelve las cacheadas.
   * - Si no, devuelve las cabeceras por defecto.
   *
   * @returns {string[]} Lista de cabeceras.
   */
  getCurrentHeaders(): string[] {
    return this.cachedDynamicHeaders || this.DEFAULT_CSV_HEADERS;
  }

  /**
   * Escapa un campo para cumplir con el estándar CSV.
   *
   * - Si contiene comas, comillas o saltos de línea, lo encierra en comillas.
   * - Doble comillas (`"`) se escapan como `""`.
   *
   * @param {string} field - Valor a escapar.
   * @returns {string} Valor listo para insertar en CSV.
   *
   * @example
   * escapeCsvField('hello,world'); // => "\"hello,world\""
   * escapeCsvField('simple');      // => "simple"
   */
  private escapeCsvField(field: string): string {
    if (!field) return '';

    if (
      field.includes(',') ||
      field.includes('"') ||
      field.includes('\n') ||
      field.includes('\r')
    ) {
      return `"${field.replace(/"/g, '""')}"`;
    }

    return field;
  }
}
