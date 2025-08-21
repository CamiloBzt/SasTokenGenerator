import { Injectable } from '@nestjs/common';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { LogFileConfig } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogStrategy } from '@src/shared/interfaces/services/blob-logging/log-strategy.interface';
import { SasService } from '../../sas.service';
import { CsvLogStrategy } from '../strategies/csv-log-strategy';
import { TraditionalLogStrategy } from '../strategies/traditional-log-strategy';
import { XlsxLogStrategy } from '../strategies/xlsx-log-strategy';

/**
 * @fileoverview
 * Fábrica de estrategias de logging para blobs en Azure Storage.
 *
 * Este servicio aplica el patrón **Factory** para devolver una implementación de
 * {@link LogStrategy} adecuada según:
 * - La extensión del archivo (`.log`, `.csv`, `.xlsx`).
 * - La configuración explícita (`LogFileConfig`).
 *
 * Actualmente soporta tres formatos:
 * - `LOG` (texto plano tradicional).
 * - `CSV` (valores separados por coma).
 * - `XLSX` (Excel).
 *
 * Si se recibe un tipo de archivo no soportado, se lanza un `Error`.
 *
 * @module sas/services/blob-logging/log-strategy-factory
 */
@Injectable()
export class LogStrategyFactory {
  constructor(private readonly sasService: SasService) {}

  /**
   * Crea y retorna la estrategia de logging adecuada según el tipo de archivo.
   *
   * - Si `config.fileType` está definido, tiene prioridad sobre la extensión.
   * - Si no se define, se detecta por extensión del nombre del archivo.
   * - Si no se detecta nada, se usa `LOG` como valor por defecto.
   *
   * @param {string} fileName - Nombre del archivo (ejemplo: `audit-2025.csv`).
   * @param {LogFileConfig} [config={}] - Configuración opcional (puede forzar `fileType`).
   * @returns {LogStrategy} Estrategia concreta (`TraditionalLogStrategy`, `CsvLogStrategy`, `XlsxLogStrategy`).
   * @throws {Error} Si el tipo de archivo no está soportado.
   *
   * @example
   * // Selección automática por extensión
   * const strategy = logStrategyFactory.createStrategy('errors.csv');
   *
   * // Forzando el tipo vía configuración
   * const strategy = logStrategyFactory.createStrategy('data.unknown', { fileType: LogFileType.CSV });
   */
  createStrategy(fileName: string, config: LogFileConfig = {}): LogStrategy {
    const fileType = this.determineFileType(fileName, config);

    switch (fileType) {
      case LogFileType.LOG:
        return new TraditionalLogStrategy(this.sasService);

      case LogFileType.CSV:
        return new CsvLogStrategy(this.sasService);

      case LogFileType.XLSX:
        return new XlsxLogStrategy(this.sasService);

      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  /**
   * Determina el tipo de archivo según configuración explícita o extensión.
   *
   * - Si `config.fileType` existe, se retorna directamente.
   * - Si no, se detecta por sufijo del `fileName`.
   * - Si no coincide con ninguno, se retorna `LogFileType.LOG`.
   *
   * @param {string} fileName - Nombre del archivo.
   * @param {LogFileConfig} [config={}] - Configuración opcional.
   * @returns {LogFileType} Tipo de archivo detectado o forzado.
   *
   * @example
   * determineFileType('audit.csv');  // LogFileType.CSV
   * determineFileType('report.xlsx'); // LogFileType.XLSX
   * determineFileType('fallback.log'); // LogFileType.LOG
   */
  private determineFileType(
    fileName: string,
    config: LogFileConfig = {},
  ): LogFileType {
    // Si se especifica explícitamente en config, usar ese
    if (config.fileType) {
      return config.fileType;
    }

    // Detectar por extensión
    if (fileName.endsWith('.csv')) {
      return LogFileType.CSV;
    } else if (fileName.endsWith('.xlsx')) {
      return LogFileType.XLSX;
    }

    // Default a LOG
    return LogFileType.LOG;
  }

  /**
   * Lista de tipos de archivo soportados actualmente.
   *
   * @returns {LogFileType[]} Array con tipos soportados (`LOG`, `CSV`, `XLSX`).
   *
   * @example
   * logStrategyFactory.getSupportedFileTypes();
   * // => [LogFileType.LOG, LogFileType.CSV, LogFileType.XLSX]
   */
  getSupportedFileTypes(): LogFileType[] {
    return [LogFileType.LOG, LogFileType.CSV, LogFileType.XLSX];
  }

  /**
   * Verifica si un tipo de archivo está soportado.
   *
   * @param {LogFileType} fileType - Tipo a validar.
   * @returns {boolean} `true` si está soportado, `false` en caso contrario.
   *
   * @example
   * logStrategyFactory.isFileTypeSupported(LogFileType.CSV); // true
   * logStrategyFactory.isFileTypeSupported('xml' as any);     // false
   */
  isFileTypeSupported(fileType: LogFileType): boolean {
    return this.getSupportedFileTypes().includes(fileType);
  }
}
