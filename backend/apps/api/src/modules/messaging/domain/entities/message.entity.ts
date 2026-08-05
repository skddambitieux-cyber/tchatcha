/**
 * TCHATCHA — msg.conversations / messages (06b §4). Messagerie (PRD §15).
 * Pagination keyset (jamais d'OFFSET) — idx (conversation_id, created_at, id).
 */
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../shared/entities/base.entity';

@Entity({ schema: 'msg', name: 'conversations' })
@Index('idx_conversations_last', ['last_message_at'])
export class Conversation extends BaseEntity {
  @Column({ type: 'varchar', length: 24 })
  type: string;

  @Column({ type: 'uuid', nullable: true })
  booking_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_message_at: Date | null;

  @Column({ type: 'varchar', length: 24, default: 'OPEN' })
  status: string;
}

@Entity({ schema: 'msg', name: 'conversation_participants' })
@Index('idx_cp_user', ['user_id', 'last_read_at'])
export class ConversationParticipant {
  @Column({ type: 'uuid', primary: true })
  conversation_id: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column({ type: 'uuid', primary: true })
  user_id: string;

  @Column({ type: 'timestamptz', nullable: true })
  last_read_at: Date | null;

  @Column({ type: 'timestamptz' })
  joined_at: Date;
}

@Entity({ schema: 'msg', name: 'messages' })
@Index('idx_messages_conv', ['conversation_id', 'created_at', 'id'])
@Index('idx_messages_conv_read', ['conversation_id', 'read_at'])
export class Message extends BaseEntity {
  @Column({ type: 'uuid' })
  conversation_id: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column({ type: 'uuid' })
  sender_id: string;

  @Column({ type: 'varchar', length: 24 })
  type: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'text', nullable: true })
  media_url: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  s3_key: string | null;

  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326, nullable: true })
  location: unknown;

  @Column({ type: 'uuid', nullable: true })
  reply_to_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  delivered_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  read_at: Date | null;
}