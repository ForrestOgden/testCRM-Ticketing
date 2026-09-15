import { Module } from "@nestjs/common";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { WebhooksController } from "./webhooks.controller";

@Module({
  controllers: [IntegrationsController, WebhooksController],
  providers: [IntegrationsService],
})
export class IntegrationsModule {}
