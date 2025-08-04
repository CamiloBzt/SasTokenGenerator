import { Module } from '@nestjs/common';
import { LoggingController } from './controllers/blob-logging.controller';
import { BlobStorageController } from './controllers/blob-storage.controller';
import { SasController } from './controllers/sas.controller';
import { LoggingService } from './services/blob-logging.service';
import { BlobStorageModule } from './services/blob-storage/blob-storage.module';
import { FileValidationService } from './services/file-validation.service';
import { SasService } from './services/sas.service';

@Module({
  imports: [BlobStorageModule],
  controllers: [SasController, BlobStorageController, LoggingController],
  providers: [SasService, FileValidationService, LoggingService],
})
export class SasModule {}
