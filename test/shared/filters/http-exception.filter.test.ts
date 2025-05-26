import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from '../../../src/shared/filters/http-exception.filter';
import { ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';

describe('HttpExceptionFilter', () => {
  let httpExceptionFilter: HttpExceptionFilter;
  let mockResponse: Partial<Response>;
  let host: ArgumentsHost;

  beforeEach(() => {
    httpExceptionFilter = new HttpExceptionFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    host = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
      }),
    } as unknown as ArgumentsHost;
  });

  it('should use statusDescription from exception.getResponse() when it is an object with statusDescription', () => {
    const exceptionResponse = { statusDescription: 'Custom Not Found' };
    const exception = new HttpException(
      exceptionResponse,
      HttpStatus.NOT_FOUND,
    );

    httpExceptionFilter.catch(exception, host);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith({
      status: {
        statusCode: HttpStatus.NOT_FOUND,
        statusDescription: 'Custom Not Found',
      },
    });
  });

  it('should use exception.message when exception.getResponse() is a string', () => {
    const exceptionResponse = 'Some error string';
    const exception = new HttpException(
      exceptionResponse,
      HttpStatus.BAD_REQUEST,
    );

    httpExceptionFilter.catch(exception, host);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      status: {
        statusCode: HttpStatus.BAD_REQUEST,
        statusDescription: exception.message,
      },
    });
  });
});
