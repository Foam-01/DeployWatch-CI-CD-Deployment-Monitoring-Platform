import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { APP_OPTIONS, configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    ...APP_OPTIONS,
    logger: ['log', 'warn', 'error', 'debug'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 4000);

  configureApp(app);

  // Swagger
  if (configService.get('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('DeployWatch API')
      .setDescription('CI/CD & Deployment Monitoring Platform REST API')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication & Authorization')
      .addTag('organizations', 'Organization Management')
      .addTag('projects', 'Project Management')
      .addTag('repositories', 'Repository Integration')
      .addTag('workflow-runs', 'CI/CD Workflow Runs')
      .addTag('deployments', 'Deployment Monitoring')
      .addTag('services', 'Service Health Checks')
      .addTag('incidents', 'Incident Management')
      .addTag('notifications', 'Notification Channels')
      .addTag('webhooks', 'GitHub Webhook Integration')
      .addTag('audit-logs', 'Audit Trail')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  app.enableShutdownHooks();
  await app.listen(port);
  console.log(`🚀 DeployWatch API is running on: http://localhost:${port}/api/v1`);
  console.log(`📚 Swagger Docs: http://localhost:${port}/api/docs`);
}

bootstrap();
