import { Module } from '@nestjs/common';
import { BlobStorageController } from './controllers/blob-storage.controller';
import { SasController } from './controllers/sas.controller';
import { BlobStorageService } from './services/blob-storage.service';
import { SasService } from './services/sas.service';

@Module({
  imports: [],
  controllers: [SasController, BlobStorageController],
  providers: [SasService, BlobStorageService],
})
export class SasModule {}
