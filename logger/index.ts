import { createLogger, format, transports } from 'winston';

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
    //
    // - Write to all logs with level `info` and below to `machine.log`.
    // - Write all logs error (and below) to `machine-error.log`.
    //
    new transports.File({
      filename: './logs/error.log',
      level: 'error',
    }),
    new transports.File({
      filename: './logs/main.log',
    }),
  ],
});

//
// If we're not in production then **ALSO** log to the `console`
// with the colorized simple format.
//
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
    })
  );
}

export default logger;
