import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SasService } from '../sas.service';
import { BlobOperationService } from './blob-operation.service';
import { BlobStorageService } from './blob-storage.service';
import { PrivateBlobService } from './private-blob.service';
import { PublicBlobService } from './public-blob.service';

@Module({
  imports: [ConfigModule],
  providers: [
    SasService,
    PrivateBlobService,
    BlobOperationService,
    PublicBlobService,
    BlobStorageService,
  ],
  exports: [
    BlobStorageService,
    PrivateBlobService,
    BlobOperationService,
    PublicBlobService,
  ],
})
export class BlobStorageModule {}
