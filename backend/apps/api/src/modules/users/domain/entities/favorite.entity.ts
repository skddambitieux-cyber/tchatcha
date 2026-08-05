/**
 * TCHATCHA — users.favorites (06a §2). Favoris client -> professionnels.
 */
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { User } from '../../../auth/domain/entities/user.entity';

@Entity({ schema: 'users', name: 'favorites' })
export class Favorite {
  @Column({ type: 'uuid', primary: true })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', primary: true })
  professional_id: string;

  @Column({ type: 'timestamptz' })
  created_at: Date;
}