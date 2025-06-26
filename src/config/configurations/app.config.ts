import { Enviroment } from '@src/shared/enums/enviroment.enum';

export default () => ({
  environment: (process.env.ENV as Enviroment) || Enviroment.Local,
  port: parseInt(process.env.PORT, 10) || 3000,
  azure: {
    storageAccountName: process.env['PENDIG-NAME-STORAGE-ACCOUNT'] || '',
    tenantId: process.env['PENDIG-ID-TENANT'] || '',
    clientId: process.env['PENDIG-CLIENT-ID-TOKEN'] || '',
    clientSecret: process.env['PENDIG-CLIENT-SECRET-TOKEN'] || '',
    connectionString: process.env['PENDIG-CLAVE-STORAGE-ACCOUNT'] || '',
    publicContainerName:
      process.env['PENDIG-CONTAINER-STORAGE-ACCOUNT-PUBLICO'] || '',
    publicConnectionString:
      process.env['PENDIG-CLAVE-STORAGE-ACCOUNT-PUBLICO'] || '',
    publicCustomDomain: process.env['PENDIG-PUBLIC-CUSTOM-DOMAIN'] || '',
  },
});
