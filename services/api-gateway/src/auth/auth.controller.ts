import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { IsString, IsEmail, IsNotEmpty } from 'class-validator';
import { PrismaService } from '@agent-workflow/prisma-client';
import { NatsService } from '@agent-workflow/nats-client';
import { SUBJECTS, OrgCreatedEvent } from '@agent-workflow/shared-types';

class SignUpBody {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  orgEmail!: string;

  @IsString()
  @IsNotEmpty()
  firebaseUid!: string;
}

class LoginBody {
  @IsString()
  @IsNotEmpty()
  firebaseUid!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signUp(@Body() body: SignUpBody) {
    const existing = await this.prisma.organization.findUnique({
      where: { firebaseUid: body.firebaseUid },
    });
    if (existing) {
      throw new ConflictException('An organization already exists for this account');
    }

    const emailTaken = await this.prisma.organization.findUnique({
      where: { orgEmail: body.orgEmail },
    });
    if (emailTaken) {
      throw new ConflictException('This email is already registered');
    }

    const org = await this.prisma.organization.create({
      data: {
        name: body.name,
        orgEmail: body.orgEmail,
        firebaseUid: body.firebaseUid,
      },
    });

    // Create default workspace
    const workspace = await this.prisma.workspace.create({
      data: { orgId: org.id, name: 'Default' },
    });

    // Create config for the default workspace
    await this.prisma.customerConfig.create({
      data: { workspaceId: workspace.id },
    });

    const event: OrgCreatedEvent = {
      orgId: org.id,
      workspaceId: workspace.id,
      name: org.name,
      orgEmail: org.orgEmail,
      apiKey: workspace.apiKey,
      workspaceName: workspace.name,
      createdAt: org.createdAt.toISOString(),
    };
    await this.nats.publish(SUBJECTS.ORG_CREATED, event);

    return {
      orgId: org.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      apiKey: workspace.apiKey,
      name: org.name,
      orgEmail: org.orgEmail,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginBody) {
    const org = await this.prisma.organization.findUnique({
      where: { firebaseUid: body.firebaseUid },
      include: {
        workspaces: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!org || org.deletedAt) {
      throw new UnauthorizedException('No organization found for this account');
    }

    const defaultWorkspace = org.workspaces[0];

    return {
      orgId: org.id,
      name: org.name,
      orgEmail: org.orgEmail,
      workspaceId: defaultWorkspace?.id,
      workspaceName: defaultWorkspace?.name,
      apiKey: defaultWorkspace?.apiKey,
      workspaces: org.workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        apiKey: w.apiKey,
      })),
    };
  }
}
