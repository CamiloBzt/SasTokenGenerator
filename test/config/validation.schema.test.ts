import { validationSchema } from '../../src/config/validation.schema';

describe('Validation Schema', () => {
  it('should return default values when no env vars are provided', () => {
    const { value } = validationSchema.validate({});
    expect(value).toMatchObject({
      ENV: 'local',
      PORT: 3000,
    });
  });

  it('should require mandatory variables', () => {
    const { error } = validationSchema.validate({ ENV: 'dev', PORT: 4000 });
    if (error) {
      expect(error).toBeDefined();
      expect(error.message).toMatch(/PENDIG-NAME-STORAGE-ACCOUNT/);
    }
  });

  it('should validate when all required fields are provided', () => {
    const input = {
      ENV: 'qa',
      PORT: 5000,
      'PENDIG-NAME-STORAGE-ACCOUNT': 'myStorage',
      'PENDIG-ID-TENANT': 'myTenant',
      'PENDIG-CLIENT-ID-TOKEN': 'myClient',
      'PENDIG-CLIENT-SECRET-TOKEN': 'mySecret',
      'PENDIG-CLAVE-STORAGE-ACCOUNT': 'myClave',
    };
    const { value, error } = validationSchema.validate(input);
    expect(error).toBeUndefined();
    expect(value).toEqual({
      ENV: 'qa',
      PORT: 5000,
      'PENDIG-NAME-STORAGE-ACCOUNT': 'myStorage',
      'PENDIG-ID-TENANT': 'myTenant',
      'PENDIG-CLIENT-ID-TOKEN': 'myClient',
      'PENDIG-CLIENT-SECRET-TOKEN': 'mySecret',
      'PENDIG-CLAVE-STORAGE-ACCOUNT': 'myClave',
    });
  });

  it('should not allow invalid ENV values', () => {
    const input = {
      ENV: 'invalid',
      PORT: 5000,
      'PENDIG-NAME-STORAGE-ACCOUNT': 'myStorage',
      'PENDIG-ID-TENANT': 'myTenant',
      'PENDIG-CLIENT-ID-TOKEN': 'myClient',
      'PENDIG-CLIENT-SECRET-TOKEN': 'mySecret',
    };
    const { error } = validationSchema.validate(input);
    expect(error).toBeDefined();
    if (error) {
      expect(error.message).toMatch(
        /"ENV" must be one of \[local, dev, qa, prod\]/,
      );
    }
  });
});
