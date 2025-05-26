import configFunction from '../../src/config/configurations/app.config';
import { Enviroment } from '../../src/shared/enums/enviroment.enum';

describe('App Configuration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return default configuration when environment variables are not set', () => {
    delete process.env.ENV;
    delete process.env.PORT;
    delete process.env.AZURE_STORAGE_ACCOUNT_NAME;
    delete process.env.AZURE_TENANT_ID;
    delete process.env.AZURE_CLIENT_ID;
    delete process.env.AZURE_CLIENT_SECRET;

    const config = configFunction();
    expect(config).toEqual({
      environment: Enviroment.Local,
      port: 3000,
      azure: {
        storageAccountName: '',
        tenantId: '',
        clientId: '',
        clientSecret: '',
      },
    });
  });

  it('should return configuration according to environment variables', () => {
    process.env.ENV = 'production';
    process.env.PORT = '8080';
    process.env.AZURE_STORAGE_ACCOUNT_NAME = 'account1';
    process.env.AZURE_TENANT_ID = 'tenant1';
    process.env.AZURE_CLIENT_ID = 'client1';
    process.env.AZURE_CLIENT_SECRET = 'secret1';

    const config = configFunction();
    expect(config).toEqual({
      environment: 'production',
      port: 8080,
      azure: {
        storageAccountName: 'account1',
        tenantId: 'tenant1',
        clientId: 'client1',
        clientSecret: 'secret1',
      },
    });
  });
});
