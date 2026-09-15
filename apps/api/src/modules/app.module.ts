import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../common/database.module";
import { requestContextMiddleware } from "../common/request-context.middleware";
import { SerializableInterceptor } from "../common/serializable.interceptor";
import { ActivitiesModule } from "./activities/activities.module";
import { ClientsModule } from "./clients/clients.module";
import { ContactsModule } from "./contacts/contacts.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { DevicesModule } from "./devices/devices.module";
import { OpportunitiesModule } from "./opportunities/opportunities.module";
import { ReportsModule } from "./reports/reports.module";
import { SearchModule } from "./search/search.module";
import { TicketsModule } from "./tickets/tickets.module";
import { DirectoryController } from "./directory.controller";
import { HealthController } from "./health.controller";
import { MeController } from "./me.controller";

@Module({
  imports: [
    DatabaseModule,
    ThrottlerModule.forRoot([{
      ttl: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
      limit: Number(process.env.RATE_LIMIT_REQUESTS ?? 240)
    }]),
    AuthModule,
    DashboardModule,
    ClientsModule,
    ContactsModule,
    TicketsModule,
    DevicesModule,
    OpportunitiesModule,
    ActivitiesModule,
    ReportsModule,
    SearchModule
  ],
  controllers: [HealthController, MeController, DirectoryController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: SerializableInterceptor }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(requestContextMiddleware).forRoutes("*");
  }
}
