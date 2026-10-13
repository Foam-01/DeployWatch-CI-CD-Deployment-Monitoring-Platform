import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id } });
    return { data: org };
  }

  async update(id: string, dto: { name?: string }) {
    const org = await this.prisma.organization.update({ where: { id }, data: dto });
    return { data: org };
  }
}
