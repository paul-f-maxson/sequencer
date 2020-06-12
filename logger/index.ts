import { createLogger, format, transports } from 'winston';

export const testLogger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'test' },
  transports: [
    // - Write to all logs with level `info` and below to `logs/combined.log`.
    new transports.File({
      filename: './logs/combined.log',
    }),
  ],
});

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'main' },
  transports: [
    // - Write all logs error (and below) to `logs/error.log`.
    new transports.File({
      filename: './logs/error.log',
      level: 'error',
    }),

    new transports.File({
      filename: './logs/debug.log',
      level: 'debug',
    }),

    // - Write to all logs with level `info` and below to `logs/combined.log`.
    new transports.File({
      filename: './logs/combined.log',
    }),
  ],
});

export default logger;
