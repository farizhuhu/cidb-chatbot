-- CIDB Chatbot — reference / seed data
--
-- Extracted verbatim from BACKEND_DATABASE_DESIGN.md section 10
-- ("Default Inserts"): workflows, languages, Malaysian states, request types,
-- document types and chatbot configuration.
--
-- Runs once, immediately after 001_baseline_schema.sql, on an empty data dir.

INSERT INTO chatbot_workflows (workflow_code, workflow_name, description, version, is_active)
VALUES
('CIDB_EMAIL_ID_CANCELLATION', 'CIDB Email ID Cancellation', 'Current chatbot flow for Email ID cancellation requests', '1.0', true)
ON CONFLICT (workflow_code) DO NOTHING;

INSERT INTO reference_languages (code, language_name, locale_tag, is_active)
VALUES
('en', 'English', 'en', true),
('ms', 'Bahasa Malaysia', 'ms', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO reference_malaysian_states (state_code, state_name, display_order, is_active)
VALUES
('JHR', 'Johor', 1, true),
('KDH', 'Kedah', 2, true),
('KTN', 'Kelantan', 3, true),
('MLK', 'Melaka', 4, true),
('NSN', 'Negeri Sembilan', 5, true),
('PHG', 'Pahang', 6, true),
('PRK', 'Perak', 7, true),
('PLS', 'Perlis', 8, true),
('PNG', 'Pulau Pinang', 9, true),
('SBH', 'Sabah', 10, true),
('SWK', 'Sarawak', 11, true),
('SGR', 'Selangor', 12, true),
('TRG', 'Terengganu', 13, true),
('WPKL', 'W.P. Kuala Lumpur', 14, true),
('WPLB', 'W.P. Labuan', 15, true),
('WPPJ', 'W.P. Putrajaya', 16, true)
ON CONFLICT (state_code) DO NOTHING;

INSERT INTO reference_request_types (request_type_code, label_en, label_ms, description, is_active)
VALUES
('EMAIL_ID_CANCELLATION', 'Email ID Cancellation', 'Pembatalan Email ID', 'Current CIDB chatbot request type', true)
ON CONFLICT (request_type_code) DO NOTHING;

INSERT INTO reference_document_types (
    document_type_code,
    label_en,
    label_ms,
    capture_mode,
    is_required_for_submission,
    allow_multiple,
    sort_order,
    allowed_mime_types,
    max_file_size_mb,
    requires_ocr,
    is_active
)
VALUES
('IC_FRONT', 'IC Front', 'IC Depan', 'upload', true, false, 1, '["image/jpeg","image/png","image/jpg","image/webp","application/pdf"]'::jsonb, 10, false, true),
('IC_BACK', 'IC Back', 'IC Belakang', 'upload', true, false, 2, '["image/jpeg","image/png","image/jpg","image/webp","application/pdf"]'::jsonb, 10, false, true),
('SIGNATURE', 'Signature', 'Tandatangan', 'signature_pad', true, false, 3, '["image/png"]'::jsonb, 5, false, true)
ON CONFLICT (document_type_code) DO NOTHING;

INSERT INTO chatbot_configuration (config_key, config_group, config_value, is_sensitive, description)
VALUES
('SESSION_TIMEOUT_MINUTES', 'retention', '{"value":30}'::jsonb, false, 'Maximum idle time before a session is considered expired'),
('ABANDONED_SESSION_RETENTION_DAYS', 'retention', '{"value":90}'::jsonb, false, 'How long abandoned sessions are retained'),
('UPLOAD_MAX_FILE_SIZE_MB', 'security', '{"value":10}'::jsonb, false, 'Default maximum file size for document uploads'),
('UPLOAD_ALLOWED_MIME_TYPES', 'security', '{"value":["image/jpeg","image/png","image/jpg","image/webp","application/pdf"]}'::jsonb, false, 'Default allowed MIME types for IC uploads'),
('SIGNATURE_ALLOWED_MIME_TYPES', 'security', '{"value":["image/png"]}'::jsonb, false, 'Allowed MIME types for signature capture output'),
('CIMS_TIMEOUT_MS', 'integration', '{"value":15000}'::jsonb, false, 'Default timeout for CIMS integration calls'),
('ENABLE_AUDIT_LOGGING', 'general', '{"value":true}'::jsonb, false, 'Enable business and security audit logging'),
('DOCUMENT_RETENTION_DAYS', 'retention', '{"value":180}'::jsonb, false, 'Default retention period for uploaded documents')
ON CONFLICT (config_key) DO NOTHING;
