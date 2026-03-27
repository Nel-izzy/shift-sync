import { Module } from '@nestjs/common';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { ConstraintService } from './constraint.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [NotificationsModule, AuditModule],
  controllers: [ShiftsController],
  providers: [ShiftsService, ConstraintService],
  exports: [ShiftsService, ConstraintService],
})
export class ShiftsModule {}
