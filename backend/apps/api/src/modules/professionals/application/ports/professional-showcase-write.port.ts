/**
 * TCHATCHA — Port : écriture de la vitrine pro (lot 6.3.4, docs/36 §5.1).
 * Toutes les mutations portent `expectedVersion` = pros.profiles.version
 * (version globale de la vitrine, RF-PW-W04b) et retournent `null` si la
 * version est obsolète (0 ligne) → le service lève 409 version_conflict.
 * L'adaptateur garantit : transaction complète par mutation, bump version
 * dans la même transaction, is_primary unique (RF-PW-W06), aucune promotion
 * automatique à la suppression du principal (RF-PW-W06b), conversion PostGIS
 * dans l'adaptateur uniquement (RF-PW-W09).
 */
export interface UpdateShowcaseCommand {
  businessName: string | null;
  headline: string | null;
  description: string | null;
  experienceYears: number | null;
  employeesCount: number | null;
  minPrice: number | null;
  website: string | null;
  socialLinks: Record<string, string> | null;
  expectedVersion: number;
}

export interface ServiceCommand {
  categoryId: string;
  title: string;
  description: string | null;
  priceFrom: number | null;
  priceTo: number | null;
  priceUnit: string | null;
  isPrimary: boolean;
  sortOrder: number;
  expectedVersion: number;
}

export interface BusinessHourInput {
  weekday: number;
  openAt: string;
  closeAt: string;
  closed: boolean;
}

export interface LocationCommand {
  lat: number;
  lon: number;
  divisionId: string | null;
  serviceRadiusKm: number;
  addressText: string | null;
  expectedVersion: number;
}

/** Ligne pros.categories pour la validation RF-PW-W07 (feuille + active). */
export interface CategoryReference {
  id: string;
  parentId: string | null;
  active: boolean;
}

/** Commande portfolio (37 RF-PW-P02) : déplacement relatif + purpose. */
export interface PortfolioItemCommand {
  purpose?: 'PORTFOLIO' | 'BEFORE_AFTER';
  sortOrder?: number;
  expectedVersion: number;
}

/** Résultat DELETE portfolio : clé S3 pour suppression de l'objet (RF-PW-P03). */
export interface DeletePortfolioResult {
  s3Key: string;
}

export interface ProfessionalShowcaseWritePort {
  updateProfile(
    userId: string,
    cmd: UpdateShowcaseCommand,
  ): Promise<boolean>;
  createService(userId: string, cmd: ServiceCommand): Promise<boolean>;
  updateService(
    userId: string,
    serviceId: string,
    cmd: ServiceCommand,
  ): Promise<boolean>;
  deleteService(
    userId: string,
    serviceId: string,
    expectedVersion: number,
  ): Promise<boolean>;
  replaceBusinessHours(
    userId: string,
    items: BusinessHourInput[],
    expectedVersion: number,
  ): Promise<boolean>;
  upsertLocation(userId: string, cmd: LocationCommand): Promise<boolean>;
  categoryById(categoryId: string): Promise<CategoryReference | null>;
  divisionExists(divisionId: string): Promise<boolean>;

  /**
   * Confirm portfolio (37 RF-PW-P01) : bump version + PROCESSING → READY,
   * sort_order = fin de liste. Le HEAD S3 a déjà été fait par le service
   * (verifyForConfirm). false = version obsolète (409) ; MediaNotFoundError
   * si la ligne n'est plus PROCESSING (race, 404).
   */
  confirmPortfolioItem(
    userId: string,
    mediaId: string,
    expectedVersion: number,
  ): Promise<boolean>;

  /**
   * Update portfolio (37 RF-PW-P02) : bump + purpose/sort_order (déplacement
   * relatif, séquence contiguë). false = version obsolète ; MediaNotFoundError
   * si la ligne READY n'existe pas.
   */
  updatePortfolioItem(
    userId: string,
    mediaId: string,
    cmd: PortfolioItemCommand,
  ): Promise<boolean>;

  /**
   * Delete portfolio (37 RF-PW-P03) : bump + soft delete (deleted_at),
   * renvoie la clé S3 pour suppression de l'objet après commit.
   * null = version obsolète (409) ; MediaNotFoundError si la ligne n'existe pas.
   */
  deletePortfolioItem(
    userId: string,
    mediaId: string,
    expectedVersion: number,
  ): Promise<DeletePortfolioResult | null>;
}

export const ProfessionalShowcaseWritePortToken =
  'ProfessionalShowcaseWritePort';
