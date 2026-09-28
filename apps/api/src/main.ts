import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadConfig } from './common/config';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api', { exclude: ['health'] });

  /**
   * In the normal setup the browser never reaches this server directly — the
   * Next.js rewrite proxies `/api/*` from the web origin, so requests arrive
   * server-to-server with no Origin header and CORS is irrelevant.
   *
   * CORS still matters for anything calling the API directly: a mobile client,
   * a second front end, curl, or local debugging. So rather than a wildcard,
   * the allow-list is explicit and requests without an Origin are permitted
   * (that covers the proxy, server-side rendering, curl and health probes).
   */
  app.enableCors({
    origin(origin, callback) {
      // No Origin header: same-origin, server-to-server, or a non-browser client.
      if (!origin) return callback(null, true);

      if (config.corsOrigins.includes(origin)) return callback(null, true);

      if (config.allowLocalhostOrigins && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      // Reject by refusing the header rather than throwing: a 500 on a
      // preflight is far harder to diagnose than a missing CORS header.
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // Cache preflights so a chatty client is not re-asking on every quote.
    maxAge: 86_400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  await app.listen(config.port, config.host);

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://${config.host}:${config.port}/api`);
  logger.log(
    config.corsOrigins.length
      ? `CORS allow-list: ${config.corsOrigins.join(', ')}${config.allowLocalhostOrigins ? ' (+ any localhost port)' : ''}`
      : 'CORS: no browser origins allowed directly — use the Next.js proxy',
  );
}

bootstrap();
