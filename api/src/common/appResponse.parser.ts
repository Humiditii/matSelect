import { HttpException } from '@nestjs/common';
import { AppErr } from './interface/main.interface';

export class AppException extends HttpException {
  constructor(
    message: string,
    status: number,
    state: boolean = false,
    extra: Record<string, unknown> = {},
  ) {
    super({ message, state, statusCode: status, ...extra }, status);
  }
}

export const AppResponse = {
  success: (message: string, statusCode: number, data: object = {}) => {
    return {
      message,
      status: true,
      statusCode,
      data,
    };
  },
  error: (err: AppErr | any) => {
    const loc = err?.location ?? 'An error occurred';

    let status = err?.status ?? err?.statusCode;
    if (typeof err?.getStatus === 'function') {
      status = err.getStatus();
    }

    if (typeof status !== 'number') {
      status = 500;
    }

    const message = err?.message
      ? err.message
      : `internal server error @ ${loc}`;

    throw new AppException(message, status);
  },
};
