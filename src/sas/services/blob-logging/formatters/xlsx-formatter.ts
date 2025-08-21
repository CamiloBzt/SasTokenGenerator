import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import { BulkLogEntry } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogFormatter } from '@src/shared/interfaces/services/blob-logging/log-formatter.interface';

/**
 * @fileoverview
 * Implementación de {@link LogFormatter} para logs en formato **Excel (.xlsx)**.
 *
 * - Soporta modo **estático** (cabeceras fijas) y **dinámico** (cabeceras
 *   derivadas de `metadata`).
 * - Internamente serializa las entradas como JSON por línea y luego las
 *   convierte en `worksheet` al generar el buffer de Excel.
 * - Ajusta el ancho de columnas automáticamente según las cabeceras.
 *
 * @module sas/services/blob-logging/formatters/xlsx-formatter
 */
@Injectable()
export class XlsxLogFormatter implements LogFormatter {
  /**
   * Encabezados por defecto cuando no se usa modo dinámico.
   */
  private readonly DEFAULT_EXCEL_HEADERS = [
    'Timestamp',
    'Level',
    'Request ID',
    'User ID',
    'Session ID',
    'Message',
    'Metadata',
  ];

  /**
   * Cache de cabeceras dinámicas generadas desde `metadata`.
   */
  private cachedDynamicHeaders: string[] | null = null;

  /**
   * Flag para indicar si se está en modo dinámico.
   */
  private isDynamicMode = false;

  /**
   * Prepara cabeceras para Excel.
   *
   * - Si `isDynamic` es `true` y `sampleEntry.metadata` existe,
   *   convierte las claves de `metadata` en cabeceras capitalizadas.
   * - Caso contrario, usa las cabeceras por defecto.
   *
   * @param {boolean} [isDynamic] - Indica si usar cabeceras dinámicas.
   * @param {LogEntry} [sampleEntry] - Entrada de ejemplo para generar cabeceras dinámicas.
   * @returns {string} Retorna cadena vacía (cabeceras se aplican al generar Excel).
   */
  formatHeader(isDynamic?: boolean, sampleEntry?: LogEntry): string {
    this.isDynamicMode = isDynamic || false;

    if (this.isDynamicMode && sampleEntry?.metadata) {
      const metadataKeys = Object.keys(sampleEntry.metadata);
      this.cachedDynamicHeaders = metadataKeys.map((key) =>
        this.capitalizeHeader(key),
      );
    }

    return '';
  }

  /**
   * Da formato a una entrada de log como JSON serializado por línea.
   *
   * - En modo dinámico: serializa únicamente los valores de `metadata` bajo cabeceras capitalizadas.
   * - En modo estático: incluye todas las cabeceras por defecto más `metadata` serializado.
   *
   * @param {LogEntry} entry - Entrada de log.
   * @param {Date} [timestamp] - Timestamp opcional; si no se da, se genera uno nuevo.
   * @returns {string} Línea JSON con salto de línea.
   */
  formatEntry(entry: LogEntry, timestamp?: Date): string {
    const logTimestamp = timestamp
      ? timestamp.toISOString()
      : new Date().toISOString();

    if (this.isDynamicMode && this.cachedDynamicHeaders && entry.metadata) {
      const rowData: Record<string, any> = {};

      const metadataKeys = Object.keys(entry.metadata);
      metadataKeys.forEach((key) => {
        const headerKey = this.capitalizeHeader(key);
        rowData[headerKey] = entry.metadata![key];
      });

      return JSON.stringify(rowData) + '\n';
    }

    const rowData = {
      Timestamp: logTimestamp,
      Level: entry.level,
      'Request ID': entry.requestId || '',
      'User ID': entry.userId || '',
      'Session ID': entry.sessionId || '',
      Message: entry.message,
      Metadata: entry.metadata ? JSON.stringify(entry.metadata) : '',
    };

    return JSON.stringify(rowData) + '\n';
  }

  /**
   * Formatea múltiples entradas concatenando la salida de {@link formatEntry}.
   *
   * @param {BulkLogEntry[]} entries - Entradas a formatear.
   * @returns {string} Bloque de texto con todas las líneas JSON.
   */
  formatBulkEntries(entries: BulkLogEntry[]): string {
    return entries
      .map((entry) => this.formatEntry(entry, entry.timestamp))
      .join('');
  }

  /**
   * Genera un buffer real de Excel (.xlsx) a partir de entradas formateadas.
   *
   * - Si `existingData` existe, lo parsea y lo combina con los nuevos registros.
   * - Usa las cabeceras dinámicas si están activas; de lo contrario, las fijas.
   * - Ajusta el ancho de columnas en función de la semántica de cada cabecera.
   *
   * @param {string} formattedEntries - Entradas en formato JSON serializado por línea.
   * @param {string} [existingData] - Datos existentes serializados para preservar historial.
   * @returns {Buffer} Buffer de un archivo Excel listo para escritura.
   *
   * @example
   * const buffer = formatter.createExcelBuffer(formatted, previous);
   * fs.writeFileSync('logs.xlsx', buffer);
   */
  createExcelBuffer(formattedEntries: string, existingData?: string): Buffer {
    const allEntries: any[] = [];

    if (existingData) {
      const existingLines = existingData
        .trim()
        .split('\n')
        .filter((line) => line.trim());
      allEntries.push(...existingLines.map((line) => JSON.parse(line)));
    }

    const newLines = formattedEntries
      .trim()
      .split('\n')
      .filter((line) => line.trim());
    allEntries.push(...newLines.map((line) => JSON.parse(line)));

    const headersToUse =
      this.cachedDynamicHeaders || this.DEFAULT_EXCEL_HEADERS;

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(allEntries, {
      header: headersToUse,
    });

    const columnWidths = this.generateColumnWidths(headersToUse);
    worksheet['!cols'] = columnWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Logs');

    return XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
      compression: true,
    }) as Buffer;
  }

  /**
   * Indica si el formato soporta **append** (agregar nuevas entradas sobre archivo existente).
   * Para Excel se retorna siempre `false` porque se sobrescribe el archivo.
   *
   * @returns {boolean} `false`.
   */
  supportsAppend(): boolean {
    return false;
  }

  /**
   * Valida que la entrada sea mínima y válida.
   * Requiere `level` y `message`.
   *
   * @param {LogEntry} entry - Entrada a validar.
   * @returns {boolean} `true` si es válida.
   */
  validateEntry(entry: LogEntry): boolean {
    return !!(entry.level && entry.message);
  }

  /**
   * Reinicia el modo dinámico eliminando cabeceras cacheadas.
   */
  resetDynamicMode(): void {
    this.cachedDynamicHeaders = null;
    this.isDynamicMode = false;
  }

  /**
   * Retorna las cabeceras actuales en uso.
   *
   * - Si existe cache dinámico, retorna esas cabeceras.
   * - De lo contrario, retorna las cabeceras por defecto.
   *
   * @returns {string[]} Cabeceras actuales.
   */
  getCurrentHeaders(): string[] {
    return this.cachedDynamicHeaders || this.DEFAULT_EXCEL_HEADERS;
  }

  /**
   * Convierte claves con `_` en títulos capitalizados separados por espacios.
   * Ejemplo: `user_id` -> `User Id`.
   *
   * @param {string} key - Clave a capitalizar.
   * @returns {string} Cabecera transformada.
   */
  private capitalizeHeader(key: string): string {
    return key
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Genera anchos de columna personalizados según la semántica de las cabeceras.
   *
   * - Columnas con `fecha` o `timestamp` => ancho 25.
   * - Columnas con `descripcion` o `detalle` => ancho 40.
   * - Columnas con `observacion` o `comentario` => ancho 35.
   * - Otras => ancho proporcional al largo del nombre + 5 (mínimo 12).
   *
   * @param {string[]} headers - Lista de cabeceras.
   * @returns {Array<{ wch: number }>} Configuración de ancho por columna.
   */
  private generateColumnWidths(headers: string[]): Array<{ wch: number }> {
    return headers.map((header) => {
      const baseWidth = Math.max(header.length + 5, 12);

      if (
        header.toLowerCase().includes('fecha') ||
        header.toLowerCase().includes('timestamp')
      ) {
        return { wch: 25 };
      }
      if (
        header.toLowerCase().includes('descripcion') ||
        header.toLowerCase().includes('detalle')
      ) {
        return { wch: 40 };
      }
      if (
        header.toLowerCase().includes('observacion') ||
        header.toLowerCase().includes('comentario')
      ) {
        return { wch: 35 };
      }

      return { wch: baseWidth };
    });
  }
}
