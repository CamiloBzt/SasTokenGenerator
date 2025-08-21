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

/**
 * Módulo principal de SAS (Secure Access Service).
 *
 * Este módulo centraliza la lógica relacionada con:
 * - **Gestión de SAS tokens** para acceso seguro a blobs.
 * - **Operaciones de almacenamiento de blobs** (subida, descarga, eliminación, movimiento, exposición).
 * - **Registro de logs en Azure Blob Storage** (formatos `.log`, `.csv`, `.xlsx`).
 * - **Validación de archivos** previos a su almacenamiento.
 *
 * ### Controladores:
 * - {@link SasController} → Endpoints para gestión de SAS tokens.
 * - {@link BlobStorageController} → Endpoints para operaciones de almacenamiento de blobs.
 * - {@link BlobLoggingController} → Endpoints para registro de logs en Blob Storage.
 *
 * ### Servicios:
 * - {@link SasService} → Lógica de autenticación y generación de SAS tokens.
 * - {@link FileValidationService} → Validación de archivos antes de subirlos.
 * - {@link BlobLoggingService} → Servicio central de logging.
 * - {@link LogStrategyFactory} → Factoría de estrategias de log según tipo de archivo.
 * - {@link TraditionalLogFormatter}, {@link CsvLogFormatter}, {@link XlsxLogFormatter} →
 *   Implementaciones de formateadores para distintos tipos de logs.
 *
 * ### Importa:
 * - {@link BlobStorageModule} → Provee la lógica central de almacenamiento en Azure Blob Storage.
 *
 * ### Exporta:
 * - `SasService` → Para uso en otros módulos.
 * - `LogStrategyFactory` → Para que otros módulos puedan inyectar estrategias de logging.
 * - `BlobLoggingService` → Para permitir logging de blobs desde módulos externos.
 */
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
