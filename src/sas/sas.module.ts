import { Module } from '@nestjs/common';
import { BlobStorageController } from './controllers/blob-storage.controller';
import { SasController } from './controllers/sas.controller';
import { BlobStorageModule } from './services/blob-storage/blob-storage.module';
import { FileValidationService } from './services/file-validation.service';
import { SasService } from './services/sas.service';

@Module({
  imports: [BlobStorageModule],
  controllers: [SasController, BlobStorageController],
  providers: [SasService, FileValidationService],
})
export class SasModule {}
