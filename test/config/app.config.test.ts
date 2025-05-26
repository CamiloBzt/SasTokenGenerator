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
    delete process.env['PENDIG-NAME-STORAGE-ACCOUNT'];
    delete process.env['PENDIG-ID-TENANT'];
    delete process.env['PENDIG-CLIENT-ID-TOKEN'];

    const config = configFunction();
    expect(config).toEqual(
      expect.objectContaining({
        environment: Enviroment.Local,
        port: 3000,
        azure: expect.objectContaining({
          storageAccountName: '',
          tenantId: '',
          clientId: '',
        }),
      }),
    );
  });

  it('should return configuration according to environment variables', () => {
    process.env.ENV = 'production';
    process.env.PORT = '8080';
    process.env['PENDIG-NAME-STORAGE-ACCOUNT'] = 'account1';
    process.env['PENDIG-ID-TENANT'] = 'tenant1';
    process.env['PENDIG-CLIENT-ID-TOKEN'] = 'client1';

    const config = configFunction();

    expect(config).toEqual(
      expect.objectContaining({
        environment: 'production',
        port: 8080,
        azure: expect.objectContaining({
          storageAccountName: 'account1',
          tenantId: 'tenant1',
          clientId: 'client1',
        }),
      }),
    );
  });
});
