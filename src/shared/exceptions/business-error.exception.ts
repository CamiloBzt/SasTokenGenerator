import { HttpException } from '@nestjs/common';
import { HttpResponseMessages } from '../enums/http-response-messages.enum';
import { HttpStatusCodes } from '../enums/http-status-codes.enum';

export class BusinessErrorException extends HttpException {
  constructor(errorMessage: string) {
    super(
      {
        statuscode: HttpStatusCodes.BUSINESS_ERROR,
        type: 'ERROR',
        statusDescription: HttpResponseMessages.BUSINESS_ERROR,
        errorMessage,
      },
      HttpStatusCodes.BUSINESS_ERROR,
    );
  }
}
