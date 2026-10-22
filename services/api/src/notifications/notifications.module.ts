import { Module } from '@nestjs/common';

import { OutboxWorkerService } from './outbox-worker.service';

@Module({ providers: [OutboxWorkerService], exports: [OutboxWorkerService] })
export class NotificationsModule {}
