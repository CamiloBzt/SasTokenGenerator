import { Injectable } from '@nestjs/common';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { LogFileConfig } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogStrategy } from '@src/shared/interfaces/services/blob-logging/log-strategy.interface';
import { SasService } from '../../sas.service';
import { CsvLogStrategy } from '../strategies/csv-log-strategy';
import { TraditionalLogStrategy } from '../strategies/traditional-log-strategy';
import { XlsxLogStrategy } from '../strategies/xlsx-log-strategy';

/**
 * Factory para crear estrategias de logging según el tipo de archivo
 */
@Injectable()
export class LogStrategyFactory {
  constructor(private readonly sasService: SasService) {}

  /**
   * Crea y retorna la estrategia apropiada según el tipo de archivo
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
   * Determina el tipo de archivo basado en la extensión o configuración
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
   * Lista los tipos de archivo soportados
   */
  getSupportedFileTypes(): LogFileType[] {
    return [LogFileType.LOG, LogFileType.CSV, LogFileType.XLSX];
  }

  /**
   * Valida si un tipo de archivo es soportado
   */
  isFileTypeSupported(fileType: LogFileType): boolean {
    return this.getSupportedFileTypes().includes(fileType);
  }
}
