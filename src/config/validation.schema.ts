import * as Joi from 'joi';

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
