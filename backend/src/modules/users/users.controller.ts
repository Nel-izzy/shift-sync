import { Controller, Get, Patch, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  UsersService, UpdateProfileDto, SetAvailabilityDto, SetExceptionDto,
} from './users.service';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../auth/auth.guard';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private svc: UsersService) {}

  // ── Admin / Manager ─────────────────────────────────────────────────────

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'List all active users (admin/manager)' })
  findAll() {
    return this.svc.findAll();
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get user by ID (admin/manager)' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Get(':id/availability')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: "Get a staff member's availability (admin/manager)" })
  getUserAvailability(@Param('id') id: string) {
    return this.svc.getAvailability(id);
  }

  @Get(':id/locations')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: "Get locations a user is certified at (admin/manager)" })
  getUserLocations(@Param('id') id: string) {
    return this.svc.getUserLocations(id);
  }

  @Post(':id/certify/:locationId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Certify a staff member at a location (admin only)' })
  certify(@Param('id') userId: string, @Param('locationId') locationId: string) {
    return this.svc.certifyAtLocation(userId, locationId);
  }

  @Post(':id/decertify/:locationId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Decertify a staff member from a location (admin only)' })
  decertify(@Param('id') userId: string, @Param('locationId') locationId: string) {
    return this.svc.decertifyFromLocation(userId, locationId);
  }

  // ── Current user (any authenticated role) ────────────────────────────────

  @Get('me/availability')
  @ApiOperation({ summary: 'Get my recurring availability and exceptions' })
  getMyAvailability(@CurrentUser() user: any) {
    return this.svc.getAvailability(user.id);
  }

  @Post('me/availability')
  @ApiOperation({ summary: 'Replace my weekly availability windows' })
  setAvailability(@CurrentUser() user: any, @Body() dto: SetAvailabilityDto) {
    return this.svc.setAvailability(user.id, dto);
  }

  @Post('me/availability/exceptions')
  @ApiOperation({ summary: 'Add or update a one-off availability exception' })
  setException(@CurrentUser() user: any, @Body() dto: SetExceptionDto) {
    return this.svc.setException(user.id, dto);
  }

  @Delete('me/availability/exceptions/:id')
  @ApiOperation({ summary: 'Delete an availability exception' })
  deleteException(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.deleteException(user.id, id);
  }

  @Get('me/assignments')
  @ApiOperation({ summary: 'Get my upcoming shift assignments' })
  getMyAssignments(@CurrentUser() user: any) {
    return this.svc.getMyAssignments(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my profile (notifications, desired hours, skills)' })
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.svc.updateProfile(user.id, dto);
  }
}
