import { Injectable } from '@nestjs/common';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { SasService } from '../../sas.service';
import { TraditionalLogFormatter } from '../formatters/log-formatter';
import { AppendBlobWriter } from '../writers/append-blob-writer';
import { BaseLogStrategy } from './base-log-strategy';

/**
 * @fileoverview
 * Estrategia concreta de logging para archivos de **texto tradicional (.log)**.
 *
 * - Usa {@link TraditionalLogFormatter} para generar líneas en texto plano
 *   con timestamp, nivel, IDs de request/usuario/sesión y metadata opcional.
 * - Usa {@link AppendBlobWriter} para escribir en **Append Blobs** de Azure.
 * - Hereda de {@link BaseLogStrategy} el flujo de inicialización, validación
 *   de entradas, rotación de archivos y manejo de headers (aunque en `.log`
 *   no aplica cabecera como en CSV/XLSX).
 *
 * @module sas/services/blob-logging/strategies/traditional-log-strategy
 *
 * @example
 * // Uso manual (normalmente se instancia vía LogStrategyFactory)
 * const strategy = new TraditionalLogStrategy(sasService);
 * await strategy.initialize('system', { rotateDaily: true });
 * await strategy.appendLog({
 *   level: 'ERROR',
 *   message: 'Unhandled exception',
 *   requestId: 'abc-123',
 *   metadata: { stack: '...' },
 * });
 */
@Injectable()
export class TraditionalLogStrategy extends BaseLogStrategy {
  /**
   * Crea la estrategia concreta con dependencias fijas:
   * - `TraditionalLogFormatter` para formato de línea en texto plano.
   * - `AppendBlobWriter` configurado para archivos `.log`.
   *
   * @param {SasService} sasService - Servicio SAS para firmar operaciones sobre blobs.
   */
  constructor(sasService: SasService) {
    const formatter = new TraditionalLogFormatter();
    const writer = new AppendBlobWriter(sasService, LogFileType.LOG);
    super(formatter, writer);
  }

  /**
   * Retorna el tipo de archivo soportado por esta estrategia.
   * @returns {LogFileType} `LogFileType.LOG`
   */
  getFileType(): LogFileType {
    return LogFileType.LOG;
  }

  /**
   * Extensión de archivo asociada a esta estrategia.
   * @returns {string} `.log`
   */
  protected getFileExtension(): string {
    return '.log';
  }
}
