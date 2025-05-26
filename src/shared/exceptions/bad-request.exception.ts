import { HttpException } from '@nestjs/common';
import { HttpResponseMessages } from '../enums/http-response-messages.enum';
import { HttpStatusCodes } from '../enums/http-status-codes.enum';

export class BadRequestException extends HttpException {
  constructor(errorMessage: string) {
    super(
      {
        statuscode: HttpStatusCodes.BAD_REQUEST,
        type: 'ERROR',
        statusDescription: HttpResponseMessages.BAD_REQUEST,
        errorMessage,
      },
      HttpStatusCodes.BAD_REQUEST,
    );
  }
}
