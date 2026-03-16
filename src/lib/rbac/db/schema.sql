-- ================================================================
--  RBAC Database Schema — PrintSaaS Multi-Tenant Platform
--  Database: PostgreSQL 15+
-- ================================================================

-- ── Extensions ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- ================================================================
--  TENANTS  (each SaaS customer = one tenant)
-- ================================================================
CREATE TABLE tenants (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    slug        TEXT        NOT NULL UNIQUE,       -- URL-safe identifier
    plan        TEXT        NOT NULL DEFAULT 'standard',
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
--  ROLES  (system-level definitions, not tenant-specific)
-- ================================================================
CREATE TABLE roles (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL UNIQUE,        -- e.g. 'super_admin'
    label       TEXT        NOT NULL,               -- e.g. 'Super Admin'
    description TEXT,
    is_system   BOOLEAN     NOT NULL DEFAULT FALSE, -- protected built-in roles
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
--  PERMISSIONS
-- ================================================================
CREATE TABLE permissions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL UNIQUE,        -- e.g. 'projects:create'
    label       TEXT        NOT NULL,               -- Human-readable
    module      TEXT        NOT NULL,               -- e.g. 'projects', 'wallet'
    action      TEXT        NOT NULL,               -- e.g. 'create', 'view'
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (module, action)
);

-- ================================================================
--  ROLE_PERMISSIONS  (many-to-many)
-- ================================================================
CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by    UUID,   -- FK to users.id (nullable for seeded data)
    PRIMARY KEY (role_id, permission_id)
);

-- ================================================================
--  USERS
-- ================================================================
CREATE TABLE users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        REFERENCES tenants(id) ON DELETE SET NULL,
    email           TEXT        NOT NULL UNIQUE,
    password_hash   TEXT        NOT NULL,
    full_name       TEXT        NOT NULL,
    phone           TEXT,
    avatar_url      TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    email_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email  ON users(email);

-- ================================================================
--  USER_ROLES  (a user can have multiple roles; scoped per tenant)
-- ================================================================
CREATE TABLE user_roles (
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id     UUID        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    tenant_id   UUID        REFERENCES tenants(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by UUID        REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, role_id, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::UUID))
);

CREATE INDEX idx_user_roles_user   ON user_roles(user_id);
CREATE INDEX idx_user_roles_tenant ON user_roles(tenant_id);

-- ================================================================
--  REFRESH_TOKENS  (JWT refresh token store)
-- ================================================================
CREATE TABLE refresh_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ================================================================
--  AUDIT_LOG  (who did what, when)
-- ================================================================
CREATE TABLE audit_log (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
    tenant_id   UUID        REFERENCES tenants(id) ON DELETE SET NULL,
    action      TEXT        NOT NULL,   -- e.g. 'project.created'
    resource    TEXT,                   -- e.g. 'project'
    resource_id UUID,
    metadata    JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user    ON audit_log(user_id);
CREATE INDEX idx_audit_tenant  ON audit_log(tenant_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- ================================================================
--  Helper view: user with all their permissions (flattened)
-- ================================================================
CREATE OR REPLACE VIEW v_user_permissions AS
SELECT
    u.id           AS user_id,
    u.email,
    u.tenant_id,
    r.name         AS role_name,
    r.label        AS role_label,
    p.name         AS permission
FROM users u
JOIN user_roles  ur ON ur.user_id   = u.id
JOIN roles        r ON r.id         = ur.role_id
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions  p ON p.id         = rp.permission_id;

-- ================================================================
--  Helper function: check permission inline in SQL
--  Usage: SELECT check_permission('<user_uuid>', 'projects:create');
-- ================================================================
CREATE OR REPLACE FUNCTION check_permission(p_user_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM v_user_permissions
        WHERE user_id = p_user_id
          AND permission = p_permission
    );
$$;
