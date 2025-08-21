import * as Joi from 'joi';

/**
 * @fileoverview
 * Esquema de validación de variables de entorno para la aplicación.
 *
 * Se utiliza junto con `ConfigModule.forRoot({ validationSchema })`
 * para asegurar que todas las variables críticas existan y cumplan
 * con el formato esperado antes de iniciar la aplicación.
 *
 * - Previene errores en tiempo de ejecución por valores faltantes.
 * - Define defaults para entorno y puerto.
 * - Obliga a que todas las credenciales de Azure estén presentes.
 *
 * @module config/validation.schema.ts
 */

/**
 * Esquema Joi para validar las variables de entorno requeridas por la app.
 *
 * ### Variables validadas:
 * - `ENV`: Entorno actual (`local`, `dev`, `qa`, `prod`). Default: `local`.
 * - `PORT`: Puerto en el que corre la app. Default: `3000`.
 * - `PENDIG-NAME-STORAGE-ACCOUNT`: Nombre de la cuenta de Azure Storage.
 * - `PENDIG-ID-TENANT`: Tenant ID de Azure AD.
 * - `PENDIG-CLIENT-ID-TOKEN`: Client ID de la app registrada en Azure AD.
 * - `PENDIG-CLIENT-SECRET-TOKEN`: Client Secret asociado al Client ID.
 * - `PENDIG-CLAVE-STORAGE-ACCOUNT`: Cadena de conexión principal de Storage.
 * - `PENDIG-CONTAINER-STORAGE-ACCOUNT-PUBLICO`: Nombre del contenedor público.
 * - `PENDIG-CLAVE-STORAGE-ACCOUNT-PUBLICO`: Cadena de conexión pública.
 * - `PENDIG-PUBLIC-CUSTOM-DOMAIN`: Dominio personalizado para blobs públicos.
 *
 * ### Uso:
 * ```ts
 * import { ConfigModule } from '@nestjs/config';
 * import { validationSchema } from './config/validation';
 *
 * @Module({
 *   imports: [
 *     ConfigModule.forRoot({
 *       isGlobal: true,
 *       validationSchema,
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
export const validationSchema = Joi.object({
  ENV: Joi.string().valid('local', 'dev', 'qa', 'prod').default('local'),

  PORT: Joi.number().default(3000),

  'PENDIG-NAME-STORAGE-ACCOUNT': Joi.string().required(),
  'PENDIG-ID-TENANT': Joi.string().required(),
  'PENDIG-CLIENT-ID-TOKEN': Joi.string().required(),
  'PENDIG-CLIENT-SECRET-TOKEN': Joi.string().required(),
  'PENDIG-CLAVE-STORAGE-ACCOUNT': Joi.string().required(),
  'PENDIG-CONTAINER-STORAGE-ACCOUNT-PUBLICO': Joi.string().required(),
  'PENDIG-CLAVE-STORAGE-ACCOUNT-PUBLICO': Joi.string().required(),
  'PENDIG-PUBLIC-CUSTOM-DOMAIN': Joi.string().required(),
});
