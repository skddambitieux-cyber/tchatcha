/**
 * TCHATCHA — Module messaging. Squelette Étape 6.1. Messagerie (PRD §15).
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Conversation,
  ConversationParticipant,
  Message,
} from './domain/entities/message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ConversationParticipant, Message]),
  ],
  exports: [TypeOrmModule],
})
export class MessagingModule {}