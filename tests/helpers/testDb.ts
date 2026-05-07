import { prisma } from "../../src/config/database";

export async function cleanDb() {
  await prisma.$transaction([
    prisma.webhookEvent.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.payment.deleteMany(),
  ]);
}

export async function disconnectDb() {
  await prisma.$disconnect();
}
