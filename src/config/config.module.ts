import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import { AppConfigService } from './config.service';
import appConfig from './configurations/app.config';
import { validationSchema } from './validation.schema';

const env = process.env.ENV || 'local';

/**
 * @fileoverview
 * Módulo de Configuración de la aplicación.
 *
 * - Carga variables de entorno (opcionalmente desde `.local.env` en entorno local).
 * - Aplica el esquema de validación con Joi para fallar rápido si faltan variables.
 * - Expone `AppConfigService` como proveedor global para acceder a la configuración tipada.
 *
 * Se registra `ConfigModule` como global (`isGlobal: true`), por lo que no es
 * necesario importarlo en otros módulos. Además, utiliza `load: [appConfig]`
 * para estructurar y tipar la configuración.
 *
 * @module config/AppConfigModule
 *
 * @example
 * // app.module.ts
 * @Module({
 *   imports: [
 *     AppConfigModule, // ya incluye ConfigModule.forRoot()
 *     StorageModule,
 *   ],
 * })
 * export class AppModule {}
 *
 * @example
 * // En un servicio cualquiera:
 * @Injectable()
 * export class BlobService {
 *   constructor(private readonly appConfig: AppConfigService) {}
 *
 *   get account() {
 *     return this.appConfig.azureStorageAccountName;
 *   }
 * }
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      /**
       * Hace disponible ConfigModule en toda la app sin reimportarlo.
       */
      isGlobal: true,

      /**
       * En entorno local, carga variables desde `.local.env` ubicado
       * en la raíz del repo (tres niveles arriba de este archivo).
       */
      ...(env === 'local' && {
        envFilePath: path.resolve(__dirname, '../../../.local.env'),
      }),

      /**
       * Estructura la configuración expuesta (app.config.ts).
       */
      load: [appConfig],

      /**
       * Valida variables de entorno requeridas (validation.schema.ts).
       */
      validationSchema,
    }),
  ],
  /**
   * Servicio wrapper para acceso tipado a la configuración.
   */
  providers: [AppConfigService],
  /**
   * Exporta AppConfigService para consumirlo en otros módulos.
   */
  exports: [AppConfigService],
})
export class AppConfigModule {}
