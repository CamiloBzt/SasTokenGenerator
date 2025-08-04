import { Module } from '@nestjs/common';
import { BlobLoggingController } from './controllers/blob-logging.controller';
import { BlobStorageController } from './controllers/blob-storage.controller';
import { SasController } from './controllers/sas.controller';
import { BlobLoggingService } from './services/blob-logging/blob-logging.service';
import { LogStrategyFactory } from './services/blob-logging/factories/log-strategy-factory';
import { CsvLogFormatter } from './services/blob-logging/formatters/csv-formatter';
import { TraditionalLogFormatter } from './services/blob-logging/formatters/log-formatter';
import { XlsxLogFormatter } from './services/blob-logging/formatters/xlsx-formatter';
import { BlobStorageModule } from './services/blob-storage/blob-storage.module';
import { FileValidationService } from './services/file-validation.service';
import { SasService } from './services/sas.service';

@Module({
  imports: [BlobStorageModule],
  controllers: [SasController, BlobStorageController, BlobLoggingController],
  providers: [
    SasService,
    FileValidationService,
    BlobLoggingService,
    LogStrategyFactory,
    TraditionalLogFormatter,
    CsvLogFormatter,
    XlsxLogFormatter,
  ],
  exports: [SasService, LogStrategyFactory, BlobLoggingService],
})
export class SasModule {}
