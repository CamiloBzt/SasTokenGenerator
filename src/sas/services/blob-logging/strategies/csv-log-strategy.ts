import { Injectable } from '@nestjs/common';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { SasService } from '../../sas.service';
import { CsvLogFormatter } from '../formatters/csv-formatter';
import { AppendBlobWriter } from '../writers/append-blob-writer';
import { BaseLogStrategy } from './base-log-strategy';

/**
 * Estrategia para archivos CSV (.csv)
 */
@Injectable()
export class CsvLogStrategy extends BaseLogStrategy {
  constructor(sasService: SasService) {
    const formatter = new CsvLogFormatter();
    const writer = new AppendBlobWriter(sasService, LogFileType.CSV);
    super(formatter, writer);
  }

  getFileType(): LogFileType {
    return LogFileType.CSV;
  }

  protected getFileExtension(): string {
    return '.csv';
  }
}
