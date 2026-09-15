import { z } from "zod";

export const TicketPrioritySchema = z.enum([
  "P1_CRITICAL",
  "P2_HIGH",
  "P3_NORMAL",
  "P4_LOW",
]);

export const CreateTicketSchema = z.object({
  clientId: z.uuid(),
  contactId: z.uuid().optional(),
  locationId: z.uuid().optional(),
  deviceId: z.uuid().optional(),
  subject: z.string().trim().min(3).max(240),
  description: z.string().trim().min(1).max(100_000),
  priority: TicketPrioritySchema.default("P3_NORMAL"),
  source: z.string().trim().min(1).max(50),
});

export type CreateTicket = z.infer<typeof CreateTicketSchema>;

export interface RmmProvider {
  listSites(): Promise<unknown[]>;
  listDevices(siteUid?: string): Promise<unknown[]>;
  getDevice(remoteUid: string): Promise<unknown>;
  listOpenAlerts(): Promise<unknown[]>;
}

export interface EmailProvider {
  sendTicketReply(input: {
    mailbox: string;
    to: string[];
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ providerMessageId: string; internetMessageId?: string }>;
}
