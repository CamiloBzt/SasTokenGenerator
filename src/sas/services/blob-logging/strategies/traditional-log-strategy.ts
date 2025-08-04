import { Injectable } from '@nestjs/common';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { SasService } from '../../sas.service';
import { TraditionalLogFormatter } from '../formatters/log-formatter';
import { AppendBlobWriter } from '../writers/append-blob-writer';
import { BaseLogStrategy } from './base-log-strategy';

/**
 * Estrategia para archivos de log tradicionales (.log)
 */
@Injectable()
export class TraditionalLogStrategy extends BaseLogStrategy {
  constructor(sasService: SasService) {
    const formatter = new TraditionalLogFormatter();
    const writer = new AppendBlobWriter(sasService, LogFileType.LOG);
    super(formatter, writer);
  }

  getFileType(): LogFileType {
    return LogFileType.LOG;
  }

  protected getFileExtension(): string {
    return '.log';
  }
}
