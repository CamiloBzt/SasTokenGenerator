import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SasService } from '../sas.service';
import { BlobOperationService } from './blob-operation.service';
import { BlobStorageService } from './blob-storage.service';
import { PrivateBlobService } from './private-blob.service';
import { PublicBlobService } from './public-blob.service';

/**
 * Módulo de almacenamiento de blobs.
 *
 * Este módulo agrupa y expone los servicios necesarios para trabajar con blobs en Azure Storage,
 * incluyendo operaciones con blobs privados, públicos y funciones de movimiento/copia.
 *
 * ### Servicios incluidos:
 * - {@link SasService} → Manejo de credenciales y generación de SAS tokens.
 * - {@link PrivateBlobService} → Subida, descarga, eliminación y listado de blobs privados.
 * - {@link PublicBlobService} → Exposición y listado de blobs públicos.
 * - {@link BlobOperationService} → Operaciones de movimiento y copia de blobs.
 * - {@link BlobStorageService} → Fachada principal que centraliza todas las operaciones.
 *
 * ### Importaciones:
 * - {@link ConfigModule} → Para acceder a variables de entorno relacionadas con Azure Storage.
 *
 * ### Exportaciones:
 * - `BlobStorageService`, `PrivateBlobService`, `BlobOperationService`, `PublicBlobService`
 *   para que otros módulos puedan utilizarlos.
 */
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
