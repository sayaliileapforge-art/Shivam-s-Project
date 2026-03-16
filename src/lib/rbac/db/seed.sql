-- ================================================================
--  Seed Data — Roles, Permissions & Role-Permission Mappings
--  PrintSaaS Multi-Tenant Platform
-- ================================================================

-- ── Roles ───────────────────────────────────────────────────────
INSERT INTO roles (id, name, label, description, is_system) VALUES
('00000001-0000-0000-0000-000000000001', 'super_admin',        'Super Admin',               'Full platform access',                          TRUE),
('00000001-0000-0000-0000-000000000002', 'master_vendor',      'Master Vendor / Franchise', 'Manages clients, projects and sub-vendors',     TRUE),
('00000001-0000-0000-0000-000000000003', 'sub_vendor',         'Sub Vendor',                'Manages assigned clients and projects',          TRUE),
('00000001-0000-0000-0000-000000000004', 'sales_person',       'Sales Person',              'Manages leads, quotes and client acquisition',  TRUE),
('00000001-0000-0000-0000-000000000005', 'designer_staff',     'Designer Staff',            'Creates templates and handles proofs',          TRUE),
('00000001-0000-0000-0000-000000000006', 'data_operator',      'Data Operator',             'Uploads and processes student data',            TRUE),
('00000001-0000-0000-0000-000000000007', 'production_manager', 'Production Manager',        'Manages print batches and dispatch',            TRUE),
('00000001-0000-0000-0000-000000000008', 'accounts_manager',   'Accounts / Credit Manager', 'Manages wallets, payments and credit',          TRUE),
('00000001-0000-0000-0000-000000000009', 'client',             'Client (School)',           'School user — proofs, data upload, tracking',   TRUE)
ON CONFLICT (name) DO NOTHING;

-- ── Permissions ─────────────────────────────────────────────────
INSERT INTO permissions (id, name, label, module, action) VALUES
-- Vendor management
('00000002-0000-0000-0000-000000000001', 'vendors:manage',                    'Manage Vendors',                     'vendors',      'manage'),
('00000002-0000-0000-0000-000000000002', 'vendors:view',                      'View Vendors',                       'vendors',      'view'),
-- Staff
('00000002-0000-0000-0000-000000000003', 'staff:manage',                      'Manage Staff',                       'staff',        'manage'),
('00000002-0000-0000-0000-000000000004', 'staff:assign',                      'Assign Staff',                       'staff',        'assign'),
('00000002-0000-0000-0000-000000000005', 'staff:view',                        'View Staff',                         'staff',        'view'),
-- Clients
('00000002-0000-0000-0000-000000000006', 'clients:manage',                    'Manage Clients',                     'clients',      'manage'),
('00000002-0000-0000-0000-000000000007', 'clients:create',                    'Create Clients',                     'clients',      'create'),
('00000002-0000-0000-0000-000000000008', 'clients:view',                      'View Clients',                       'clients',      'view'),
('00000002-0000-0000-0000-000000000009', 'clients:block',                     'Block Clients',                      'clients',      'block'),
-- Products
('00000002-0000-0000-0000-000000000010', 'products:manage_catalog',           'Manage Product Catalog',             'products',     'manage_catalog'),
('00000002-0000-0000-0000-000000000011', 'products:manage_pricing',           'Manage Pricing Rules',               'products',     'manage_pricing'),
('00000002-0000-0000-0000-000000000012', 'products:view',                     'View Products',                      'products',     'view'),
-- Projects
('00000002-0000-0000-0000-000000000013', 'projects:view_all',                 'View All Projects',                  'projects',     'view_all'),
('00000002-0000-0000-0000-000000000014', 'projects:view_assigned',            'View Assigned Projects',             'projects',     'view_assigned'),
('00000002-0000-0000-0000-000000000015', 'projects:create',                   'Create Projects',                    'projects',     'create'),
('00000002-0000-0000-0000-000000000016', 'projects:override_stage',           'Override Project Stage',             'projects',     'override_stage'),
-- Leads & Quotes
('00000002-0000-0000-0000-000000000017', 'leads:manage',                      'Manage Leads',                       'leads',        'manage'),
('00000002-0000-0000-0000-000000000018', 'quotes:generate',                   'Generate Quotes',                    'quotes',       'generate'),
-- Orders
('00000002-0000-0000-0000-000000000019', 'orders:manage',                     'Manage Print Orders',                'orders',       'manage'),
('00000002-0000-0000-0000-000000000020', 'orders:view',                       'View Print Orders',                  'orders',       'view'),
-- Design
('00000002-0000-0000-0000-000000000021', 'design:access_studio',              'Access Designer Studio',             'design',       'access_studio'),
('00000002-0000-0000-0000-000000000022', 'design:create_edit_templates',      'Create/Edit Templates',              'design',       'create_edit_templates'),
('00000002-0000-0000-0000-000000000023', 'design:receive_tasks',              'Receive Design Tasks',               'design',       'receive_tasks'),
('00000002-0000-0000-0000-000000000024', 'design:upload_proofs',              'Upload Proofs',                      'design',       'upload_proofs'),
('00000002-0000-0000-0000-000000000025', 'design:send_proofs',                'Send Proofs for Approval',           'design',       'send_proofs'),
('00000002-0000-0000-0000-000000000026', 'design:access_data',                'Access Uploaded Data',               'design',       'access_data'),
('00000002-0000-0000-0000-000000000027', 'design:generate_previews',          'Generate Previews',                  'design',       'generate_previews'),
-- Data Ops
('00000002-0000-0000-0000-000000000028', 'data:upload_excel',                 'Upload Excel Files',                 'data',         'upload_excel'),
('00000002-0000-0000-0000-000000000029', 'data:map_columns',                  'Map Columns',                        'data',         'map_columns'),
('00000002-0000-0000-0000-000000000030', 'data:validate_records',             'Validate Records',                   'data',         'validate_records'),
('00000002-0000-0000-0000-000000000031', 'data:upload_photos',                'Upload Photos',                      'data',         'upload_photos'),
('00000002-0000-0000-0000-000000000032', 'data:auto_match_photos',            'Auto Match Photos',                  'data',         'auto_match_photos'),
('00000002-0000-0000-0000-000000000033', 'data:fix_photos',                   'Fix Missing Photos',                 'data',         'fix_photos'),
('00000002-0000-0000-0000-000000000034', 'data:edit_records',                 'Edit Records Manually',              'data',         'edit_records'),
-- Production
('00000002-0000-0000-0000-000000000035', 'production:view_approved',          'View Approved Projects',             'production',   'view_approved'),
('00000002-0000-0000-0000-000000000036', 'production:generate_pdfs',          'Generate Print PDFs',                'production',   'generate_pdfs'),
('00000002-0000-0000-0000-000000000037', 'production:manage_batches',         'Manage Print Batches',               'production',   'manage_batches'),
('00000002-0000-0000-0000-000000000038', 'production:dispatch',               'Dispatch Management',                'production',   'dispatch'),
('00000002-0000-0000-0000-000000000039', 'production:reprint',                'Reprint Tracking',                   'production',   'reprint'),
-- Wallet
('00000002-0000-0000-0000-000000000040', 'wallet:manage',                     'Manage Wallets',                     'wallet',       'manage'),
('00000002-0000-0000-0000-000000000041', 'wallet:view',                       'View Wallet Balance',                'wallet',       'view'),
('00000002-0000-0000-0000-000000000042', 'wallet:record_payment',             'Record Manual Payment',              'wallet',       'record_payment'),
('00000002-0000-0000-0000-000000000043', 'wallet:upload_receipts',            'Upload Receipts',                    'wallet',       'upload_receipts'),
('00000002-0000-0000-0000-000000000044', 'wallet:set_credit_limit',           'Set Credit Limits',                  'wallet',       'set_credit_limit'),
('00000002-0000-0000-0000-000000000045', 'wallet:monitor_overdue',            'Monitor Overdue Balances',           'wallet',       'monitor_overdue'),
-- Commission
('00000002-0000-0000-0000-000000000046', 'commission:manage_rules',           'Manage Commission Rules',            'commission',   'manage_rules'),
('00000002-0000-0000-0000-000000000047', 'commission:track',                  'Track Commissions',                  'commission',   'track'),
('00000002-0000-0000-0000-000000000048', 'commission:view',                   'View Commission',                    'commission',   'view'),
-- Reports
('00000002-0000-0000-0000-000000000049', 'reports:platform',                  'Platform Analytics',                 'reports',      'platform'),
('00000002-0000-0000-0000-000000000050', 'reports:vendor',                    'Vendor Performance Reports',         'reports',      'vendor'),
('00000002-0000-0000-0000-000000000051', 'reports:production',                'Production Efficiency Reports',      'reports',      'production'),
('00000002-0000-0000-0000-000000000052', 'reports:financial',                 'Financial Reports',                  'reports',      'financial'),
('00000002-0000-0000-0000-000000000053', 'reports:wallet',                    'Wallet Reports',                     'reports',      'wallet'),
('00000002-0000-0000-0000-000000000054', 'reports:sales',                     'Sales Reports',                      'reports',      'sales'),
-- Client Portal
('00000002-0000-0000-0000-000000000055', 'client_portal:upload_data',         'Upload Student Data',                'client_portal','upload_data'),
('00000002-0000-0000-0000-000000000056', 'client_portal:upload_photos',       'Upload Student Photos',              'client_portal','upload_photos'),
('00000002-0000-0000-0000-000000000057', 'client_portal:review_proofs',       'Review Proofs',                      'client_portal','review_proofs'),
('00000002-0000-0000-0000-000000000058', 'client_portal:approve_designs',     'Approve/Reject Designs',             'client_portal','approve_designs'),
('00000002-0000-0000-0000-000000000059', 'client_portal:view_production',     'View Production Status',             'client_portal','view_production'),
('00000002-0000-0000-0000-000000000060', 'client_portal:track_shipment',      'Track Shipment',                     'client_portal','track_shipment'),
('00000002-0000-0000-0000-000000000061', 'client_portal:view_invoices',       'View Invoices',                      'client_portal','view_invoices'),
-- Platform
('00000002-0000-0000-0000-000000000062', 'platform:configure',                'Platform Configuration',             'platform',     'configure'),
('00000002-0000-0000-0000-000000000063', 'platform:manage_roles',             'Manage Roles & Access',              'platform',     'manage_roles')
ON CONFLICT (name) DO NOTHING;

-- ── Role-Permission Mappings ────────────────────────────────────
-- Super Admin gets every permission (insert all)
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000001-0000-0000-0000-000000000001', id FROM permissions
ON CONFLICT DO NOTHING;

-- Master Vendor
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000001-0000-0000-0000-000000000002', id FROM permissions
WHERE name IN (
    'clients:manage','clients:create','clients:view',
    'projects:view_all','projects:create',
    'orders:manage','orders:view',
    'staff:assign','staff:view',
    'wallet:manage','wallet:view','wallet:record_payment','wallet:upload_receipts',
    'commission:track','commission:view',
    'reports:vendor','reports:sales','reports:financial','reports:wallet',
    'products:view',
    'leads:manage','quotes:generate',
    'production:view_approved'
) ON CONFLICT DO NOTHING;

-- Sub Vendor
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000001-0000-0000-0000-000000000003', id FROM permissions
WHERE name IN (
    'clients:view','clients:create',
    'projects:view_assigned','projects:create',
    'orders:view',
    'data:upload_excel','data:upload_photos',
    'wallet:view',
    'design:access_data',
    'production:view_approved'
) ON CONFLICT DO NOTHING;

-- Sales Person
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000001-0000-0000-0000-000000000004', id FROM permissions
WHERE name IN (
    'clients:create','clients:view',
    'leads:manage','quotes:generate',
    'projects:create','projects:view_assigned',
    'orders:view',
    'commission:view',
    'products:view'
) ON CONFLICT DO NOTHING;

-- Designer Staff
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000001-0000-0000-0000-000000000005', id FROM permissions
WHERE name IN (
    'design:access_studio','design:create_edit_templates',
    'design:receive_tasks','design:upload_proofs','design:send_proofs',
    'design:access_data','design:generate_previews',
    'projects:view_assigned'
) ON CONFLICT DO NOTHING;

-- Data Operator
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000001-0000-0000-0000-000000000006', id FROM permissions
WHERE name IN (
    'data:upload_excel','data:map_columns','data:validate_records',
    'data:upload_photos','data:auto_match_photos','data:fix_photos','data:edit_records',
    'design:access_data',
    'projects:view_assigned'
) ON CONFLICT DO NOTHING;

-- Production Manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000001-0000-0000-0000-000000000007', id FROM permissions
WHERE name IN (
    'production:view_approved','production:generate_pdfs',
    'production:manage_batches','production:dispatch','production:reprint',
    'orders:view','orders:manage',
    'reports:production',
    'projects:view_assigned'
) ON CONFLICT DO NOTHING;

-- Accounts / Credit Manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000001-0000-0000-0000-000000000008', id FROM permissions
WHERE name IN (
    'wallet:manage','wallet:view','wallet:record_payment',
    'wallet:upload_receipts','wallet:set_credit_limit','wallet:monitor_overdue',
    'clients:view','clients:block',
    'reports:financial','reports:wallet',
    'projects:view_all'
) ON CONFLICT DO NOTHING;

-- Client (School)
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000001-0000-0000-0000-000000000009', id FROM permissions
WHERE name IN (
    'projects:view_assigned',
    'client_portal:upload_data','client_portal:upload_photos',
    'client_portal:review_proofs','client_portal:approve_designs',
    'client_portal:view_production','client_portal:track_shipment',
    'client_portal:view_invoices',
    'wallet:view'
) ON CONFLICT DO NOTHING;

-- ── Sample demo tenant & users ──────────────────────────────────
INSERT INTO tenants (id, name, slug) VALUES
('00000000-0000-0000-0000-000000000001', 'PrintSaaS Demo', 'demo')
ON CONFLICT DO NOTHING;

INSERT INTO users (id, tenant_id, email, password_hash, full_name) VALUES
('00000003-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'admin@printsaas.com',  '$2b$10$placeholder_hash', 'Super Admin'),
('00000003-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'vendor@printsaas.com', '$2b$10$placeholder_hash', 'Vendor User'),
('00000003-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'school@example.com',   '$2b$10$placeholder_hash', 'School Admin')
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id, tenant_id) VALUES
('00000003-0000-0000-0000-000000000001', '00000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
('00000003-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),
('00000003-0000-0000-0000-000000000003', '00000001-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
