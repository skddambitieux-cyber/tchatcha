/**
 * TCHATCHA — Adapter TypeORM de ProfessionalShowcaseWritePort (6.3.4, 36 §5.1).
 * Transactions complètes par mutation ; pros.profiles.version = version
 * globale de la vitrine, incrémentée dans la même transaction (RF-PW-W04b) ;
 * is_primary unique (RF-PW-W06) sans promotion automatique (RF-PW-W06b) ;
 * conversion PostGIS ST_MakePoint dans l'adaptateur uniquement (RF-PW-W09).
 * Retourne false si la version est obsolète (0 ligne) → 409 par le service.
 */
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ProfessionalProfile } from '../../domain/entities/professional-profile.entity';
import { ServiceNotFoundError } from '../../domain/errors/professionals-errors';
import {
  MediaNotFoundError,
  PortfolioUpdateInvalidError,
} from '../../../media/domain/errors/media-errors';
import {
  BusinessHourInput,
  CategoryReference,
  DeletePortfolioResult,
  LocationCommand,
  PortfolioItemCommand,
  ProfessionalShowcaseWritePort,
  ServiceCommand,
  UpdateShowcaseCommand,
} from '../../application/ports/professional-showcase-write.port';

@Injectable()
export class TypeOrmProfessionalShowcaseWriter
  implements ProfessionalShowcaseWritePort
{
  constructor(private readonly dataSource: DataSource) {}

  async updateProfile(
    userId: string,
    cmd: UpdateShowcaseCommand,
  ): Promise<boolean> {
    const { affected } = await this.dataSource
      .createQueryBuilder()
      .update(ProfessionalProfile)
      .set({
        business_name: cmd.businessName,
        headline: cmd.headline,
        description: cmd.description,
        experience_years: cmd.experienceYears,
        employees_count: cmd.employeesCount,
        min_price: cmd.minPrice,
        website: cmd.website,
        social_links: cmd.socialLinks,
        version: () => '"version" + 1',
      })
      .where('user_id = :userId', { userId })
      .andWhere('version = :version', { version: cmd.expectedVersion })
      .andWhere('deleted_at IS NULL')
      .execute();
    return affected > 0;
  }

  async createService(
    userId: string,
    cmd: ServiceCommand,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const ok = await this.touchProfileVersion(manager, userId, cmd.expectedVersion);
      if (!ok) return false;
      if (cmd.isPrimary) {
        await this.resetPrimaryServices(manager, userId);
      }
      await manager.query(
        `INSERT INTO pros.services (
           id, professional_id, category_id, title, description,
           price_from, price_to, price_unit, is_primary, sort_order,
           created_at, updated_at
         ) VALUES (gen_random_uuid(), (SELECT id FROM pros.profiles WHERE user_id = $1),
           $2, $3, $4, $5, $6, $7, $8, $9, now(), now())`,
        [
          userId,
          cmd.categoryId,
          cmd.title,
          cmd.description,
          cmd.priceFrom,
          cmd.priceTo,
          cmd.priceUnit,
          cmd.isPrimary ?? false,
          cmd.sortOrder ?? 0,
        ],
      );
      return true;
    });
  }

  async updateService(
    userId: string,
    serviceId: string,
    cmd: ServiceCommand,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const ok = await this.touchProfileVersion(manager, userId, cmd.expectedVersion);
      if (!ok) return false;
      const [rows] = await manager.query(
        `UPDATE pros.services SET
           category_id = $3, title = $4, description = $5,
           price_from = $6, price_to = $7, price_unit = $8,
           is_primary = $9, sort_order = $10, updated_at = now()
         WHERE id = $1
           AND professional_id = (SELECT id FROM pros.profiles WHERE user_id = $2)
           AND deleted_at IS NULL
         RETURNING id`,
        [
          serviceId,
          userId,
          cmd.categoryId,
          cmd.title,
          cmd.description,
          cmd.priceFrom,
          cmd.priceTo,
          cmd.priceUnit,
          cmd.isPrimary ?? false,
          cmd.sortOrder ?? 0,
        ],
      );
      if (rows.length === 0) {
        // rollback du bump : aucune mutation si le service n'existe pas.
        throw new ServiceNotFoundError();
      }
      if (cmd.isPrimary) {
        await this.resetPrimaryServices(manager, userId, serviceId);
      }
      return true;
    });
  }

  async deleteService(
    userId: string,
    serviceId: string,
    expectedVersion: number,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const ok = await this.touchProfileVersion(manager, userId, expectedVersion);
      if (!ok) return false;
      const [rows] = await manager.query(
        `UPDATE pros.services SET deleted_at = now(), updated_at = now()
         WHERE id = $1
           AND professional_id = (SELECT id FROM pros.profiles WHERE user_id = $2)
           AND deleted_at IS NULL
         RETURNING id`,
        [serviceId, userId],
      );
      if (rows.length === 0) {
        // rollback du bump : 404 service inconnu.
        throw new ServiceNotFoundError();
      }
      // RF-PW-W06b : aucune promotion automatique du principal supprimé.
      return true;
    });
  }

  async replaceBusinessHours(
    userId: string,
    items: BusinessHourInput[],
    expectedVersion: number,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const ok = await this.touchProfileVersion(manager, userId, expectedVersion);
      if (!ok) return false;
      await manager.query(
        `DELETE FROM pros.business_hours WHERE professional_id = (
           SELECT id FROM pros.profiles WHERE user_id = $1
         )`,
        [userId],
      );
      for (const item of items) {
        await manager.query(
          `INSERT INTO pros.business_hours (
             professional_id, weekday, open_at, close_at, closed
           ) VALUES ((SELECT id FROM pros.profiles WHERE user_id = $1), $2, $3, $4, $5)`,
          [userId, item.weekday, item.openAt, item.closeAt, item.closed],
        );
      }
      return true;
    });
  }

  async upsertLocation(
    userId: string,
    cmd: LocationCommand,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const ok = await this.touchProfileVersion(manager, userId, cmd.expectedVersion);
      if (!ok) return false;
      // RF-PW-W09 : conversion PostGIS dans l'adaptateur uniquement.
      await manager.query(
        `INSERT INTO pros.locations (
           professional_id, country_code, division_id, location,
           service_radius_km, address_text, updated_at
         ) VALUES (
           (SELECT id FROM pros.profiles WHERE user_id = $1),
           (SELECT country_code FROM pros.profiles WHERE user_id = $1),
           $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6, now()
         )
         ON CONFLICT (professional_id) DO UPDATE SET
           division_id = EXCLUDED.division_id,
           location = EXCLUDED.location,
           service_radius_km = EXCLUDED.service_radius_km,
           address_text = EXCLUDED.address_text,
           updated_at = now()`,
        [
          userId,
          cmd.divisionId,
          cmd.lon,
          cmd.lat,
          cmd.serviceRadiusKm,
          cmd.addressText,
        ],
      );
      return true;
    });
  }

  /**
   * Confirm portfolio (37 RF-PW-P01) : bump version + PROCESSING → READY,
   * sort_order = fin de liste. Le HEAD S3 a été fait par le service.
   */
  async confirmPortfolioItem(
    userId: string,
    mediaId: string,
    expectedVersion: number,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const ok = await this.touchProfileVersion(manager, userId, expectedVersion);
      if (!ok) return false;
      const [maxRow] = await manager.query(
        `SELECT COALESCE(MAX(sort_order) + 1, 0)::int AS next
           FROM media.files
          WHERE owner_type = 'PROFESSIONAL'
            AND owner_id = (SELECT id FROM pros.profiles WHERE user_id = $1)
            AND status = 'READY' AND deleted_at IS NULL`,
        [userId],
      );
      const [rows] = await manager.query(
        `UPDATE media.files SET status = 'READY', sort_order = $3,
           updated_at = now()
         WHERE id = $1
           AND owner_type = 'PROFESSIONAL'
           AND owner_id = (SELECT id FROM pros.profiles WHERE user_id = $2)
           AND status = 'PROCESSING' AND deleted_at IS NULL
         RETURNING id`,
        [mediaId, userId, Number(maxRow.next)],
      );
      if (rows.length === 0) {
        // rollback du bump : ligne absente ou plus PROCESSING (race).
        throw new MediaNotFoundError();
      }
      return true;
    });
  }

  /**
   * Update portfolio (37 RF-PW-P02) : bump + purpose et/ou sort_order
   * (déplacement relatif, séquence contiguë 0..n-1, même transaction).
   */
  async updatePortfolioItem(
    userId: string,
    mediaId: string,
    cmd: PortfolioItemCommand,
  ): Promise<boolean> {
    if (
      cmd.purpose !== undefined &&
      cmd.purpose !== 'PORTFOLIO' &&
      cmd.purpose !== 'BEFORE_AFTER'
    ) {
      throw new PortfolioUpdateInvalidError();
    }
    return this.dataSource.transaction(async (manager) => {
      const ok = await this.touchProfileVersion(manager, userId, cmd.expectedVersion);
      if (!ok) return false;
      const rows = await manager.query(
        `SELECT id, sort_order FROM media.files
          WHERE id = $1
            AND owner_type = 'PROFESSIONAL'
            AND owner_id = (SELECT id FROM pros.profiles WHERE user_id = $2)
            AND status = 'READY' AND deleted_at IS NULL
          LIMIT 1`,
        [mediaId, userId],
      );
      if (rows.length === 0) {
        // rollback du bump : 404 media inconnu ou d'un autre pro.
        throw new MediaNotFoundError();
      }
      const current = Number(rows[0].sort_order);
      let target = current;
      if (cmd.sortOrder !== undefined && cmd.sortOrder !== current) {
        const countRows = await manager.query(
          `SELECT count(*)::int AS n FROM media.files
            WHERE owner_type = 'PROFESSIONAL'
              AND owner_id = (SELECT id FROM pros.profiles WHERE user_id = $1)
              AND status = 'READY' AND deleted_at IS NULL`,
          [userId],
        );
        const count = Number(countRows[0].n);
        target = Math.max(0, Math.min(cmd.sortOrder, count - 1));
        if (target > current) {
          await manager.query(
            `UPDATE media.files SET sort_order = sort_order - 1, updated_at = now()
              WHERE owner_type = 'PROFESSIONAL'
                AND owner_id = (SELECT id FROM pros.profiles WHERE user_id = $1)
                AND status = 'READY' AND deleted_at IS NULL
                AND id <> $2 AND sort_order > $3 AND sort_order <= $4`,
            [userId, mediaId, current, target],
          );
        } else if (target < current) {
          await manager.query(
            `UPDATE media.files SET sort_order = sort_order + 1, updated_at = now()
              WHERE owner_type = 'PROFESSIONAL'
                AND owner_id = (SELECT id FROM pros.profiles WHERE user_id = $1)
                AND status = 'READY' AND deleted_at IS NULL
                AND id <> $2 AND sort_order >= $3 AND sort_order < $4`,
            [userId, mediaId, target, current],
          );
        }
      }
      const [upd] = await manager.query(
        `UPDATE media.files SET purpose = COALESCE($3, purpose),
           sort_order = $4, updated_at = now()
         WHERE id = $1
           AND owner_type = 'PROFESSIONAL'
           AND owner_id = (SELECT id FROM pros.profiles WHERE user_id = $2)
           AND status = 'READY' AND deleted_at IS NULL
         RETURNING id`,
        [mediaId, userId, cmd.purpose ?? null, target],
      );
      if (upd.length === 0) {
        throw new MediaNotFoundError();
      }
      return true;
    });
  }

  /**
   * Delete portfolio (37 RF-PW-P03) : bump + soft delete (deleted_at),
   * renvoie la clé S3 pour suppression de l'objet après commit.
   */
  async deletePortfolioItem(
    userId: string,
    mediaId: string,
    expectedVersion: number,
  ): Promise<DeletePortfolioResult | null> {
    return this.dataSource.transaction(async (manager) => {
      const ok = await this.touchProfileVersion(manager, userId, expectedVersion);
      if (!ok) return null;
      const [rows] = await manager.query(
        `UPDATE media.files SET deleted_at = now(), updated_at = now()
         WHERE id = $1
           AND owner_type = 'PROFESSIONAL'
           AND owner_id = (SELECT id FROM pros.profiles WHERE user_id = $2)
           AND status = 'READY' AND deleted_at IS NULL
         RETURNING s3_key`,
        [mediaId, userId],
      );
      if (rows.length === 0) {
        // rollback du bump : 404 media inconnu ou d'un autre pro.
        throw new MediaNotFoundError();
      }
      return { s3Key: rows[0].s3_key };
    });
  }

  async categoryById(categoryId: string): Promise<CategoryReference | null> {    const rows = await this.dataSource.query(
      `SELECT id, parent_id AS "parentId", active
         FROM pros.categories
        WHERE id = $1 AND deleted_at IS NULL
        LIMIT 1`,
      [categoryId],
    );
    const r = rows[0];
    if (!r) return null;
    return { id: r.id, parentId: r.parentId, active: r.active };
  }

  async divisionExists(divisionId: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM geo.divisions WHERE id = $1 LIMIT 1`,
      [divisionId],
    );
    return rows.length > 0;
  }

  /**
   * Bump pros.profiles.version si expectedVersion correspond (RF-PW-W04b).
   * Retourne false (aucune écriture) si version obsolète. Note : pour UPDATE/
   * DELETE, manager.query renvoie [rows, rowCount] (PostgresQueryRunner).
   */
  private async touchProfileVersion(
    manager: EntityManager,
    userId: string,
    expectedVersion: number,
  ): Promise<boolean> {
    const [rows] = await manager.query(
      `UPDATE pros.profiles SET version = version + 1, updated_at = now()
       WHERE user_id = $1 AND version = $2 AND deleted_at IS NULL
       RETURNING id`,
      [userId, expectedVersion],
    );
    return rows.length > 0;
  }

  /** RF-PW-W06 : un seul is_primary — reset des autres services du pro. */
  private async resetPrimaryServices(
    manager: EntityManager,
    userId: string,
    exceptId?: string,
  ): Promise<void> {
    await manager.query(
      `UPDATE pros.services SET is_primary = false, updated_at = now()
       WHERE professional_id = (SELECT id FROM pros.profiles WHERE user_id = $1)
         AND deleted_at IS NULL
         ${exceptId ? 'AND id <> $2' : ''}`,
      exceptId ? [userId, exceptId] : [userId],
    );
  }
}
