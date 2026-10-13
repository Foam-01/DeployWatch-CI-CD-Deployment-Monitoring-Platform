import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id } });
    return { data: org };
  }

  async update(id: string, actorUserId: string, dto: { name: string }) {
    const org = await this.prisma.$transaction(async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({ where: { id } });
      const updated = await tx.organization.update({ where: { id }, data: { name: dto.name.trim() } });
      await tx.auditLog.create({
        data: {
          organizationId: id,
          actorUserId,
          action: 'UPDATE',
          resourceType: 'organization',
          resourceId: id,
          metadata: { from: before.name, to: updated.name },
        },
      });
      return updated;
    });
    return { data: org };
  }
}
