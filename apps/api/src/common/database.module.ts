import { Global, Module, OnModuleDestroy, Injectable } from "@nestjs/common";
import { createDatabaseClient, type DatabaseClient } from "@msp-crm/database";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly prisma: DatabaseClient = createDatabaseClient();

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService]
})
export class DatabaseModule {}
