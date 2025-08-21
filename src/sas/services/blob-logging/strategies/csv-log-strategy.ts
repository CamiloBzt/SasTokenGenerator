import { Injectable } from '@nestjs/common';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { SasService } from '../../sas.service';
import { CsvLogFormatter } from '../formatters/csv-formatter';
import { AppendBlobWriter } from '../writers/append-blob-writer';
import { BaseLogStrategy } from './base-log-strategy';

/**
 * @fileoverview
 * Estrategia concreta de logging para archivos **CSV** (`.csv`).
 *
 * - Usa {@link CsvLogFormatter} para formatear entradas (modo estático y dinámico).
 * - Usa {@link AppendBlobWriter} para escribir en **Append Blobs** de Azure.
 * - Hereda flujo de inicialización, validación, cabeceras dinámicas y rotación de {@link BaseLogStrategy}.
 *
 * @module sas/services/blob-logging/strategies/csv-log-strategy
 *
 * @example
 * // Creación e inicialización manual (normalmente se usa vía Factory):
 * const strategy = new CsvLogStrategy(sasService);
 * await strategy.initialize('audit', { dynamicColumns: false, rotateDaily: true });
 * await strategy.appendLog({ level: 'INFO', message: 'Login ok', userId: '42' });
 */
@Injectable()
export class CsvLogStrategy extends BaseLogStrategy {
  /**
   * Inyecta dependencias concretas:
   * - `CsvLogFormatter` para formato CSV (con soporte de columnas dinámicas).
   * - `AppendBlobWriter` para escritura en Azure Blob con tipo `CSV`.
   *
   * @param {SasService} sasService - Servicio SAS para firmar operaciones sobre blobs.
   */
  constructor(sasService: SasService) {
    const formatter = new CsvLogFormatter();
    const writer = new AppendBlobWriter(sasService, LogFileType.CSV);
    super(formatter, writer);
  }

  /**
   * Tipo de archivo soportado por esta estrategia.
   * @returns {LogFileType} `LogFileType.CSV`
   */
  getFileType(): LogFileType {
    return LogFileType.CSV;
  }

  /**
   * Extensión de archivo usada por esta estrategia.
   * @returns {string} `.csv`
   */
  protected getFileExtension(): string {
    return '.csv';
  }
}
