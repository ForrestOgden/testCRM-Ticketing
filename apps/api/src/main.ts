import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix("api");
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3001, "0.0.0.0");
}

void bootstrap();
