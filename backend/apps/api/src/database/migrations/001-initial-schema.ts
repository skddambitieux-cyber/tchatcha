/**
 * TCHATCHA â€” Migration initiale : extensions + schÃ©mas + tables MVP.
 * FidÃ¨le Ã  06-schema-base.md (PostgreSQL 16 + PostGIS), 06a, 06b.
 * Migrations = 1 par module (convention 06 Â§6.4) ; cette migration 001 crÃ©e
 * l'infrastructure de base ; les suivantes affineront chaque domaine.
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1744200000000 implements MigrationInterface {
  name = 'InitialSchema1744200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Extensions (PostGIS requis)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS ltree`);

    // 2. SchÃ©mas mÃ©tier
    for (const schema of [
      'authz', 'users', 'geo', 'pros', 'market', 'pay', 'review',
      'msg', 'notif', 'admin', 'audit', 'media', 'search',
    ]) {
      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    }

    // 3. geo.countries
    await queryRunner.query(`
      CREATE TABLE geo.countries (
        code CHAR(2) PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        name_translations JSONB NOT NULL DEFAULT '{}',
        currency CHAR(3) NOT NULL,
        phone_code VARCHAR(8) NOT NULL,
        locale_default VARCHAR(10) NOT NULL DEFAULT 'fr',
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // 4. geo.divisions
    await queryRunner.query(`
      CREATE TABLE geo.divisions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code CHAR(2) NOT NULL REFERENCES geo.countries(code),
        parent_id UUID REFERENCES geo.divisions(id),
        type VARCHAR(24) NOT NULL,
        name VARCHAR(120) NOT NULL,
        name_translations JSONB NOT NULL DEFAULT '{}',
        depth INT NOT NULL CHECK (depth BETWEEN 0 AND 4),
        path LTREE,
        centroid GEOMETRY(Point,4326),
        boundary GEOMETRY(MultiPolygon,4326),
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_divisions_parent ON geo.divisions(parent_id)`);
    await queryRunner.query(`CREATE INDEX idx_divisions_path ON geo.divisions USING GIST (path)`);
    await queryRunner.query(`CREATE INDEX idx_divisions_country ON geo.divisions(country_code, type)`);
    await queryRunner.query(`CREATE INDEX idx_divisions_centroid ON geo.divisions USING GIST (centroid)`);

    // 5. users.users
    await queryRunner.query(`
      CREATE TABLE users.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code CHAR(2) NOT NULL REFERENCES geo.countries(code),
        phone VARCHAR(20) NOT NULL,
        email VARCHAR(255),
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(120) NOT NULL,
        avatar_url TEXT,
        locale VARCHAR(10) NOT NULL DEFAULT 'fr',
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING_OTP',
        otp_verified_at TIMESTAMPTZ,
        last_login_at TIMESTAMPTZ,
        flags JSONB NOT NULL DEFAULT '{}',
        anonymized_at TIMESTAMPTZ,
        version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_users_phone ON users.users(phone, country_code) WHERE deleted_at IS NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_users_email ON users.users(email) WHERE email IS NOT NULL AND deleted_at IS NULL`);
    await queryRunner.query(`CREATE INDEX idx_users_status ON users.users(country_code, status)`);

    // 6. authz.otp_codes (trace d'audit â€” la vÃ©rification chaude vit en Redis)
    await queryRunner.query(`
      CREATE TABLE authz.otp_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(20) NOT NULL,
        country_code CHAR(2) NOT NULL REFERENCES geo.countries(code),
        purpose VARCHAR(32) NOT NULL,
        code_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        attempts INT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_otp_phone_purpose_created ON authz.otp_codes(phone, purpose, created_at DESC)`);

    // 7. authz.refresh_tokens (rotation, ADR-004)
    await queryRunner.query(`
      CREATE TABLE authz.refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        device_id VARCHAR(64) NOT NULL,
        ip INET NOT NULL,
        user_agent TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        replaced_by UUID REFERENCES authz.refresh_tokens(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_refresh_tokens_user ON authz.refresh_tokens(user_id, revoked_at)`);

    // 8. users.user_roles (multi-rÃ´les â€” PRD)
    await queryRunner.query(`
      CREATE TABLE users.user_roles (
        user_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
        role VARCHAR(32) NOT NULL,
        granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, role)
      )
    `);

    // 9. users.devices (FCM)
    await queryRunner.query(`
      CREATE TABLE users.devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
        device_id VARCHAR(64) NOT NULL,
        platform VARCHAR(16) NOT NULL,
        fcm_token VARCHAR(255),
        last_seen_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, device_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_devices_fcm ON users.devices(fcm_token)`);

    // 10. users.addresses
    await queryRunner.query(`
      CREATE TABLE users.addresses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
        country_code CHAR(2) NOT NULL REFERENCES geo.countries(code),
        division_id UUID REFERENCES geo.divisions(id),
        label VARCHAR(64) NOT NULL,
        address_line TEXT,
        location GEOMETRY(Point,4326),
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_addresses_user ON users.addresses(user_id)`);

    // 11. users.favorites
    await queryRunner.query(`
      CREATE TABLE users.favorites (
        user_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
        professional_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, professional_id)
      )
    `);

    // 12. users.consents (RGPD â€” 06d Â§6)
    await queryRunner.query(`
      CREATE TABLE users.consents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users.users(id) ON DELETE CASCADE,
        type VARCHAR(32) NOT NULL,
        version VARCHAR(16) NOT NULL,
        granted BOOLEAN NOT NULL,
        granted_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, type)
      )
    `);

    // 13. users.user_settings
    await queryRunner.query(`
      CREATE TABLE users.user_settings (
        user_id UUID PRIMARY KEY REFERENCES users.users(id) ON DELETE CASCADE,
        language VARCHAR(10) NOT NULL DEFAULT 'fr',
        notif_channels JSONB NOT NULL DEFAULT '{"push":true,"sms":false,"email":true,"whatsapp":false}',
        quiet_hours JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // 14. pros.categories (arborescence seedable â€” 20-catalogue-benin.md)
    await queryRunner.query(`
      CREATE TABLE pros.categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        parent_id UUID REFERENCES pros.categories(id),
        country_code CHAR(2) NOT NULL REFERENCES geo.countries(code),
        name VARCHAR(120) NOT NULL,
        slug VARCHAR(140) NOT NULL,
        icon_url TEXT,
        sort_order INT NOT NULL DEFAULT 0,
        translations JSONB NOT NULL DEFAULT '{}',
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_categories_slug ON pros.categories(country_code, slug) WHERE deleted_at IS NULL`);
    await queryRunner.query(`CREATE INDEX idx_categories_parent ON pros.categories(parent_id)`);

    // 15. pros.profiles
    await queryRunner.query(`
      CREATE TABLE pros.profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users.users(id) ON DELETE CASCADE,
        business_name VARCHAR(120),
        headline VARCHAR(160),
        description TEXT,
        experience_years SMALLINT,
        employees_count SMALLINT,
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        verified BOOLEAN NOT NULL DEFAULT false,
        verified_at TIMESTAMPTZ,
        rating_avg NUMERIC(2,1) NOT NULL DEFAULT 0 CHECK (rating_avg BETWEEN 0 AND 5),
        rating_count INT NOT NULL DEFAULT 0,
        trust_score NUMERIC(3,2) NOT NULL DEFAULT 0,
        completed_jobs INT NOT NULL DEFAULT 0,
        response_time_min INT,
        min_price NUMERIC(14,2),
        currency CHAR(3) NOT NULL,
        website VARCHAR(255),
        social_links JSONB,
        country_code CHAR(2) NOT NULL REFERENCES geo.countries(code),
        version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_profiles_rating ON pros.profiles(status, country_code, rating_avg DESC)`);
    await queryRunner.query(`CREATE INDEX idx_profiles_verified ON pros.profiles(verified) WHERE status = 'ACTIVE'`);

    // 16. pros.services
    await queryRunner.query(`
      CREATE TABLE pros.services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        professional_id UUID NOT NULL REFERENCES pros.profiles(id) ON DELETE CASCADE,
        category_id UUID NOT NULL REFERENCES pros.categories(id),
        title VARCHAR(160) NOT NULL,
        description TEXT,
        price_from NUMERIC(14,2),
        price_to NUMERIC(14,2) CHECK (price_to IS NULL OR price_to >= price_from),
        price_unit VARCHAR(24),
        is_primary BOOLEAN NOT NULL DEFAULT false,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_services_category ON pros.services(category_id, is_primary)`);

    // 17. pros.locations (PostGIS â€” recherche par rayon)
    await queryRunner.query(`
      CREATE TABLE pros.locations (
        professional_id UUID PRIMARY KEY REFERENCES pros.profiles(id) ON DELETE CASCADE,
        country_code CHAR(2) NOT NULL REFERENCES geo.countries(code),
        division_id UUID REFERENCES geo.divisions(id),
        location GEOMETRY(Point,4326) NOT NULL,
        service_radius_km NUMERIC(6,2) NOT NULL DEFAULT 10,
        address_text TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_pros_locations_gist ON pros.locations USING GIST (location)`);

    // 18. pros.business_hours
    await queryRunner.query(`
      CREATE TABLE pros.business_hours (
        professional_id UUID NOT NULL REFERENCES pros.profiles(id) ON DELETE CASCADE,
        weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
        open_at TIME NOT NULL,
        close_at TIME NOT NULL CHECK (close_at > open_at),
        closed BOOLEAN NOT NULL DEFAULT false,
        PRIMARY KEY (professional_id, weekday)
      )
    `);

    // 19. pros.reputation (Trust Score â€” 06d Â§2)
    await queryRunner.query(`
      CREATE TABLE pros.reputation (
        professional_id UUID PRIMARY KEY REFERENCES pros.profiles(id) ON DELETE CASCADE,
        completed_jobs INT NOT NULL DEFAULT 0,
        acceptance_rate NUMERIC(5,2),
        cancellation_rate NUMERIC(5,2),
        avg_response_min INT,
        punctuality_avg NUMERIC(2,1),
        avg_execution_days NUMERIC(5,1),
        disputes_count INT NOT NULL DEFAULT 0,
        seniority_days INT NOT NULL DEFAULT 0,
        verification_level SMALLINT NOT NULL DEFAULT 0,
        ai_factor NUMERIC(5,2),
        trust_score NUMERIC(3,2) NOT NULL DEFAULT 0,
        trust_level VARCHAR(16) NOT NULL DEFAULT 'NEW',
        recomputed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_reputation_score ON pros.reputation(trust_score DESC)`);

    // 20. market.service_requests (agrÃ©gat racine â€” Mode B)
    await queryRunner.query(`
      CREATE TABLE market.service_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NOT NULL REFERENCES users.users(id),
        category_id UUID NOT NULL REFERENCES pros.categories(id),
        title VARCHAR(160) NOT NULL,
        description TEXT NOT NULL,
        country_code CHAR(2) NOT NULL REFERENCES geo.countries(code),
        division_id UUID REFERENCES geo.divisions(id),
        location GEOMETRY(Point,4326),
        budget_min NUMERIC(14,2),
        budget_max NUMERIC(14,2) CHECK (budget_max IS NULL OR budget_max >= budget_min),
        currency CHAR(3) NOT NULL,
        desired_date TIMESTAMPTZ,
        urgency VARCHAR(24) NOT NULL DEFAULT 'NORMAL',
        status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        expires_at TIMESTAMPTZ NOT NULL,
        canceled_by UUID,
        cancel_reason TEXT,
        version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_requests_status_expires ON market.service_requests(status, expires_at) WHERE status IN ('OPEN','QUOTED')`);
    await queryRunner.query(`CREATE INDEX idx_requests_category_created ON market.service_requests(category_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_requests_client ON market.service_requests(client_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_requests_location ON market.service_requests USING GIST (location)`);

    // 21. market.quotes
    await queryRunner.query(`
      CREATE TABLE market.quotes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL REFERENCES market.service_requests(id) ON DELETE CASCADE,
        professional_id UUID NOT NULL REFERENCES pros.profiles(id),
        parent_quote_id UUID REFERENCES market.quotes(id),
        price NUMERIC(14,2) NOT NULL CHECK (price > 0),
        currency CHAR(3) NOT NULL,
        duration_days SMALLINT,
        message TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        accepted_at TIMESTAMPTZ,
        version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_quotes_request ON market.quotes(request_id, created_at)`);
    await queryRunner.query(`CREATE INDEX idx_quotes_pro ON market.quotes(professional_id, created_at DESC)`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_quotes_active ON market.quotes(request_id, professional_id) WHERE status = 'PENDING'`);

    // 22. market.bookings (verrouille le crÃ©neau + double confirmation)
    await queryRunner.query(`
      CREATE TABLE market.bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL REFERENCES market.service_requests(id),
        quote_id UUID NOT NULL UNIQUE REFERENCES market.quotes(id),
        client_id UUID NOT NULL REFERENCES users.users(id),
        professional_id UUID NOT NULL REFERENCES pros.profiles(id),
        scheduled_start TIMESTAMPTZ NOT NULL,
        scheduled_end TIMESTAMPTZ CHECK (scheduled_end IS NULL OR scheduled_end > scheduled_start),
        status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED',
        client_confirmed_at TIMESTAMPTZ,
        pro_confirmed_at TIMESTAMPTZ,
        location GEOMETRY(Point,4326),
        address_text TEXT,
        notes TEXT,
        version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_bookings_pro_date ON market.bookings(professional_id, scheduled_start)`);
    await queryRunner.query(`CREATE INDEX idx_bookings_client ON market.bookings(client_id, scheduled_start DESC)`);
    await queryRunner.query(`CREATE INDEX idx_bookings_status ON market.bookings(status)`);

    // 23. market.disputes
    await queryRunner.query(`
      CREATE TABLE market.disputes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID NOT NULL REFERENCES market.bookings(id),
        opened_by UUID NOT NULL REFERENCES users.users(id),
        reason TEXT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        resolution TEXT,
        resolved_by UUID,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_disputes_status ON market.disputes(status)`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_disputes_booking_open ON market.disputes(booking_id) WHERE status IN ('OPEN','UNDER_REVIEW')`);

    // 24. pay.transactions + provider_operations + payouts (ADR-015)
    await queryRunner.query(`
      CREATE TABLE pay.transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users.users(id),
        type VARCHAR(32) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
        fee NUMERIC(14,2) NOT NULL DEFAULT 0,
        currency CHAR(3) NOT NULL,
        booking_id UUID REFERENCES market.bookings(id),
        order_id UUID,
        subscription_id UUID,
        country_code CHAR(2) NOT NULL REFERENCES geo.countries(code),
        version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_transactions_user ON pay.transactions(user_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_transactions_booking ON pay.transactions(booking_id)`);
    await queryRunner.query(`CREATE INDEX idx_transactions_status ON pay.transactions(status)`);

    await queryRunner.query(`
      CREATE TABLE pay.provider_operations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id UUID NOT NULL REFERENCES pay.transactions(id),
        provider_code VARCHAR(32) NOT NULL,
        operation_type VARCHAR(32) NOT NULL,
        external_ref VARCHAR(128),
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        amount NUMERIC(14,2) NOT NULL,
        request_payload JSONB,
        response_payload JSONB,
        initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_provider_ops_transaction ON pay.provider_operations(transaction_id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_provider_ops_external ON pay.provider_operations(provider_code, external_ref) WHERE external_ref IS NOT NULL`);

    await queryRunner.query(`
      CREATE TABLE pay.payouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        professional_id UUID NOT NULL REFERENCES pros.profiles(id),
        amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
        currency CHAR(3) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'REQUESTED',
        provider_operation_id UUID REFERENCES pay.provider_operations(id),
        requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_payouts_pro ON pay.payouts(professional_id, requested_at DESC)`);

    // 25. review.reviews + review_flags
    await queryRunner.query(`
      CREATE TABLE review.reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID NOT NULL UNIQUE REFERENCES market.bookings(id),
        request_id UUID NOT NULL REFERENCES market.service_requests(id),
        reviewer_id UUID NOT NULL REFERENCES users.users(id),
        reviewee_id UUID NOT NULL REFERENCES pros.profiles(id),
        rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        punctuality SMALLINT NOT NULL CHECK (punctuality BETWEEN 1 AND 5),
        quality SMALLINT NOT NULL CHECK (quality BETWEEN 1 AND 5),
        price_ratio SMALLINT NOT NULL CHECK (price_ratio BETWEEN 1 AND 5),
        politeness SMALLINT NOT NULL CHECK (politeness BETWEEN 1 AND 5),
        comment TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        moderated_by UUID,
        moderated_at TIMESTAMPTZ,
        helpful_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_reviews_reviewee ON review.reviews(reviewee_id, status, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_reviews_reviewer ON review.reviews(reviewer_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_reviews_status ON review.reviews(status)`);

    await queryRunner.query(`
      CREATE TABLE review.review_flags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        review_id UUID NOT NULL REFERENCES review.reviews(id) ON DELETE CASCADE,
        flagged_by UUID NOT NULL REFERENCES users.users(id),
        reason VARCHAR(64) NOT NULL,
        comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (review_id, flagged_by)
      )
    `);

    // 26. msg.conversations / participants / messages
    await queryRunner.query(`
      CREATE TABLE msg.conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(24) NOT NULL,
        booking_id UUID REFERENCES market.bookings(id),
        last_message_at TIMESTAMPTZ,
        status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_conversations_last ON msg.conversations(last_message_at DESC)`);

    await queryRunner.query(`
      CREATE TABLE msg.conversation_participants (
        conversation_id UUID NOT NULL REFERENCES msg.conversations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users.users(id),
        last_read_at TIMESTAMPTZ,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (conversation_id, user_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_cp_user ON msg.conversation_participants(user_id, last_read_at)`);

    await queryRunner.query(`
      CREATE TABLE msg.messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES msg.conversations(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users.users(id),
        type VARCHAR(24) NOT NULL,
        content TEXT,
        media_url TEXT,
        s3_key VARCHAR(512),
        location GEOMETRY(Point,4326),
        reply_to_id UUID REFERENCES msg.messages(id),
        delivered_at TIMESTAMPTZ,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_messages_conv ON msg.messages(conversation_id, created_at, id)`);
    await queryRunner.query(`CREATE INDEX idx_messages_conv_read ON msg.messages(conversation_id, read_at)`);

    // 27. notif.notifications + templates
    await queryRunner.query(`
      CREATE TABLE notif.notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users.users(id),
        type VARCHAR(48) NOT NULL,
        title VARCHAR(160) NOT NULL,
        body TEXT,
        data JSONB,
        channel VARCHAR(24) NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
        sent_at TIMESTAMPTZ,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_notifications_user ON notif.notifications(user_id, read_at)`);
    await queryRunner.query(`CREATE INDEX idx_notifications_pending ON notif.notifications(status)`);

    await queryRunner.query(`
      CREATE TABLE notif.notification_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(64) NOT NULL,
        channel VARCHAR(24) NOT NULL,
        language VARCHAR(10) NOT NULL,
        subject VARCHAR(200),
        body TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true,
        version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (code, channel, language)
      )
    `);

    // 28. admin.validation_tasks + bans
    await queryRunner.query(`
      CREATE TABLE admin.validation_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type VARCHAR(32) NOT NULL,
        entity_id UUID NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
        assignee_id UUID REFERENCES users.users(id),
        decided_by UUID REFERENCES users.users(id),
        decided_at TIMESTAMPTZ,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_validation_tasks_status ON admin.validation_tasks(status)`);
    await queryRunner.query(`CREATE INDEX idx_validation_tasks_entity ON admin.validation_tasks(entity_type, entity_id)`);

    await queryRunner.query(`
      CREATE TABLE admin.bans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users.users(id),
        reason TEXT NOT NULL,
        banned_by UUID NOT NULL REFERENCES users.users(id),
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_bans_user ON admin.bans(user_id, ends_at)`);

    // 29. audit.logs / events (Outbox) / aggregate_events
    await queryRunner.query(`
      CREATE TABLE audit.logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id UUID REFERENCES users.users(id),
        action VARCHAR(64) NOT NULL,
        entity_type VARCHAR(32) NOT NULL,
        entity_id UUID NOT NULL,
        before JSONB,
        after JSONB,
        ip INET,
        user_agent TEXT,
        country_code CHAR(2),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_audit_entity ON audit.logs(entity_type, entity_id, created_at)`);
    await queryRunner.query(`CREATE INDEX idx_audit_actor ON audit.logs(actor_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_audit_action ON audit.logs(action, created_at)`);

    await queryRunner.query(`
      CREATE TABLE audit.events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        aggregate_type VARCHAR(64) NOT NULL,
        aggregate_id UUID NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_events_status ON audit.events(status, created_at)`);

    await queryRunner.query(`
      CREATE TABLE audit.aggregate_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        aggregate_type VARCHAR(64) NOT NULL,
        aggregate_id UUID NOT NULL,
        version BIGINT NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        payload JSONB NOT NULL,
        actor_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (aggregate_type, aggregate_id, version)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_aggregate_events_time ON audit.aggregate_events(created_at)`);

    // 30. media.files (06d Â§5)
    await queryRunner.query(`
      CREATE TABLE media.files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_type VARCHAR(32) NOT NULL,
        owner_id UUID NOT NULL,
        purpose VARCHAR(32) NOT NULL,
        media_type VARCHAR(16) NOT NULL,
        mime_type VARCHAR(64) NOT NULL,
        size_bytes BIGINT NOT NULL DEFAULT 0,
        width INT,
        height INT,
        duration_sec INT,
        url TEXT NOT NULL,
        s3_key VARCHAR(512) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        status VARCHAR(16) NOT NULL DEFAULT 'PROCESSING',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_media_owner ON media.files(owner_type, owner_id, sort_order)`);
    await queryRunner.query(`CREATE INDEX idx_media_s3 ON media.files(s3_key)`);

    // 31. search.pro_search_docs (projection â€” 06b Â§9, ajustement 3)
    await queryRunner.query(`
      CREATE TABLE search.pro_search_docs (
        professional_id UUID PRIMARY KEY REFERENCES pros.profiles(id) ON DELETE CASCADE,
        country_code CHAR(2) NOT NULL,
        status VARCHAR(32) NOT NULL,
        category_ids UUID[] NOT NULL,
        name_search TSVECTOR NOT NULL,
        name_trgm VARCHAR(160) NOT NULL,
        rating_avg NUMERIC(2,1) NOT NULL,
        trust_score NUMERIC(3,2) NOT NULL,
        min_price NUMERIC(14,2),
        location GEOMETRY(Point,4326) NOT NULL,
        division_id UUID,
        available_today BOOLEAN NOT NULL DEFAULT false,
        available_now BOOLEAN NOT NULL DEFAULT false,
        available_until TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        version BIGINT NOT NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_search_name ON search.pro_search_docs USING GIN (name_search)`);
    await queryRunner.query(`CREATE INDEX idx_search_trgm ON search.pro_search_docs USING GIN (name_trgm gin_trgm_ops)`);
    await queryRunner.query(`CREATE INDEX idx_search_location ON search.pro_search_docs USING GIST (location)`);
    await queryRunner.query(`CREATE INDEX idx_search_filters ON search.pro_search_docs(country_code, status, available_today, rating_avg DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'search.pro_search_docs',
      'media.files',
      'audit.aggregate_events',
      'audit.events',
      'audit.logs',
      'admin.bans',
      'admin.validation_tasks',
      'notif.notification_templates',
      'notif.notifications',
      'msg.messages',
      'msg.conversation_participants',
      'msg.conversations',
      'review.review_flags',
      'review.reviews',
      'pay.payouts',
      'pay.provider_operations',
      'pay.transactions',
      'market.disputes',
      'market.bookings',
      'market.quotes',
      'market.service_requests',
      'pros.reputation',
      'pros.business_hours',
      'pros.locations',
      'pros.services',
      'pros.profiles',
      'pros.categories',
      'users.user_settings',
      'users.consents',
      'users.favorites',
      'users.addresses',
      'users.devices',
      'users.user_roles',
      'authz.refresh_tokens',
      'authz.otp_codes',
      'users.users',
      'geo.divisions',
      'geo.countries',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
    for (const schema of ['search', 'media', 'audit', 'admin', 'notif', 'msg', 'review', 'pay', 'market', 'pros', 'geo', 'users', 'authz']) {
      await queryRunner.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
  }
}

