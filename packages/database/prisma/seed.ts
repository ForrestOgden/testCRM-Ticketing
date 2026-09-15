import "dotenv/config";
import { createDatabaseClient } from "../src";

const db = createDatabaseClient();

const permissions = [
  "admin.manage_users",
  "admin.manage_settings",
  "crm.read",
  "crm.write",
  "crm.archive",
  "contact.read",
  "contact.write",
  "ticket.read",
  "ticket.write",
  "ticket.assign",
  "ticket.close",
  "ticket.delete",
  "device.read",
  "device.write",
  "rmm.read",
  "rmm.execute",
  "opportunity.read",
  "opportunity.write",
  "activity.read",
  "activity.write",
  "report.read",
  "automation.read",
  "automation.write",
  "integration.manage",
  "audit.read"
] as const;

const rolePermissions: Record<string, readonly string[]> = {
  Administrator: permissions,
  Manager: permissions.filter((key) => !["admin.manage_users", "rmm.execute"].includes(key)),
  Technician: permissions.filter((key) =>
    [
      "crm.read", "contact.read", "contact.write", "ticket.read", "ticket.write",
      "ticket.assign", "ticket.close", "device.read", "device.write", "rmm.read",
      "activity.read", "activity.write", "report.read", "opportunity.read"
    ].includes(key)
  ),
  Sales: permissions.filter((key) =>
    ["crm.read", "crm.write", "contact.read", "contact.write", "opportunity.read",
      "opportunity.write", "activity.read", "activity.write", "ticket.read", "device.read"].includes(key)
  ),
  "Read Only": permissions.filter((key) =>
    ["crm.read", "contact.read", "ticket.read", "device.read", "rmm.read",
      "opportunity.read", "activity.read", "report.read", "automation.read"].includes(key)
  )
};

async function seedSecurity() {
  const permissionByKey = new Map<string, string>();
  for (const key of permissions) {
    const record = await db.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: key.replaceAll(".", " ") }
    });
    permissionByKey.set(key, record.id);
  }

  for (const [name, keys] of Object.entries(rolePermissions)) {
    const role = await db.role.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} role` }
    });

    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({
      data: keys.map((key) => ({
        roleId: role.id,
        permissionId: permissionByKey.get(key)!
      })),
      skipDuplicates: true
    });
  }

  const adminRole = await db.role.findUniqueOrThrow({ where: { name: "Administrator" } });
  const email = process.env.DEV_USER_EMAIL ?? "admin@mspcrm.local";
  const user = await db.user.upsert({
    where: { email },
    update: { displayName: process.env.DEV_USER_NAME ?? "Local Administrator", isActive: true },
    create: {
      email,
      displayName: process.env.DEV_USER_NAME ?? "Local Administrator",
      entraObjectId: process.env.DEV_USER_OID ?? "00000000-0000-0000-0000-000000000001"
    }
  });
  await db.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    update: {},
    create: { userId: user.id, roleId: adminRole.id }
  });
}

async function seedCoreData() {
  for (const name of ["Help Desk", "Infrastructure", "Projects"]) {
    await db.ticketQueue.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true }
    });
  }

  if (process.env.SEED_SAMPLE_DATA !== "true") return;

  const client = await db.client.upsert({
    where: { slug: "adams-accounting" },
    update: {},
    create: {
      slug: "adams-accounting",
      name: "Adams Accounting",
      lifecycleStatus: "ACTIVE",
      primaryDomain: "adams.example",
      mainPhone: "555-0100",
      industry: "Accounting",
      employeeCount: 42,
      clientSince: new Date("2022-01-01"),
      relationshipHealth: 92
    }
  });

  const location = await db.location.findFirst({ where: { clientId: client.id, isPrimary: true } })
    ?? await db.location.create({
      data: {
        clientId: client.id,
        name: "Main Office",
        city: "Springfield",
        region: "MO",
        countryCode: "US",
        isPrimary: true
      }
    });

  const contact = await db.contact.findFirst({
    where: { clientId: client.id, email: "jane@adams.example" }
  }) ?? await db.contact.create({
    data: {
      clientId: client.id,
      locationId: location.id,
      firstName: "Jane",
      lastName: "Smith",
      department: "Accounting",
      email: "jane@adams.example",
      isTechnicalContact: true
    }
  });

  const device = await db.device.findFirst({
    where: { clientId: client.id, hostname: "DESKTOP-JSMITH" }
  }) ?? await db.device.create({
    data: {
      clientId: client.id,
      locationId: location.id,
      hostname: "DESKTOP-JSMITH",
      manufacturer: "Dell",
      model: "OptiPlex 7090",
      operatingSystem: "Windows 11 Pro",
      lastLoggedInUser: "ADAMS\\jsmith",
      isOnline: true,
      openAlertCount: 1
    }
  });

  const existing = await db.ticket.findFirst({
    where: { clientId: client.id, subject: "Outlook keeps asking for my password" }
  });
  if (!existing) {
    await db.ticket.create({
      data: {
        subject: "Outlook keeps asking for my password",
        description: "Outlook repeatedly prompts for Microsoft 365 credentials.",
        clientId: client.id,
        contactId: contact.id,
        locationId: location.id,
        deviceId: device.id,
        status: "IN_PROGRESS",
        priority: "P2_HIGH",
        type: "INCIDENT",
        source: "seed",
        entries: {
          create: [
            {
              kind: "CUSTOMER_MESSAGE",
              bodyText: "Outlook keeps prompting me to sign in. I enter my password and it comes back a few minutes later."
            },
            {
              kind: "TECHNICIAN_MESSAGE",
              bodyText: "I’m checking the device and Microsoft 365 sign-in state now. I’ll update you shortly."
            }
          ]
        }
      }
    });
  }
}

async function main() {
  await seedSecurity();
  await seedCoreData();
}

main()
  .then(() => console.log("Database seed complete."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
