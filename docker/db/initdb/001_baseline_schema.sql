-- CIDB Chatbot — baseline schema
--
-- Extracted verbatim from BACKEND_DATABASE_DESIGN.md section 11
-- ("Complete PostgreSQL DDL"). backend/migrations/ contains only incremental
-- changes made after this baseline, so a brand-new database needs this file
-- first.
--
-- Postgres runs everything in /docker-entrypoint-initdb.d exactly once, when
-- the data directory is empty. Existing databases are untouched.
-- The app container then applies backend/migrations/ on top at startup.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TABLE chatbot_workflows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_code varchar(80) NOT NULL,
    workflow_name varchar(150) NOT NULL,
    description text,
    version varchar(30) NOT NULL DEFAULT '1.0',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_chatbot_workflows_code UNIQUE (workflow_code),
    CONSTRAINT ck_chatbot_workflows_version CHECK (version <> '')
);

CREATE INDEX idx_chatbot_workflows_is_active ON chatbot_workflows (is_active);

CREATE TABLE reference_languages (
    code varchar(10) PRIMARY KEY,
    language_name varchar(80) NOT NULL,
    locale_tag varchar(20),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reference_languages_is_active ON reference_languages (is_active);

CREATE TABLE reference_malaysian_states (
    state_code varchar(10) PRIMARY KEY,
    state_name varchar(50) NOT NULL,
    display_order smallint NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_reference_malaysian_states_name UNIQUE (state_name)
);

CREATE INDEX idx_reference_malaysian_states_is_active ON reference_malaysian_states (is_active);
CREATE INDEX idx_reference_malaysian_states_display_order ON reference_malaysian_states (display_order);

CREATE TABLE reference_request_types (
    request_type_code varchar(30) PRIMARY KEY,
    label_en varchar(120) NOT NULL,
    label_ms varchar(120) NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reference_request_types_is_active ON reference_request_types (is_active);

CREATE TABLE reference_document_types (
    document_type_code varchar(30) PRIMARY KEY,
    label_en varchar(100) NOT NULL,
    label_ms varchar(100) NOT NULL,
    capture_mode varchar(20) NOT NULL,
    is_required_for_submission boolean NOT NULL DEFAULT true,
    allow_multiple boolean NOT NULL DEFAULT false,
    sort_order smallint NOT NULL DEFAULT 0,
    allowed_mime_types jsonb NOT NULL DEFAULT '[]'::jsonb,
    max_file_size_mb integer NOT NULL DEFAULT 10,
    requires_ocr boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_reference_document_types_capture_mode CHECK (capture_mode IN ('upload', 'signature_pad')),
    CONSTRAINT ck_reference_document_types_max_file_size_mb CHECK (max_file_size_mb > 0),
    CONSTRAINT ck_reference_document_types_allowed_mime_types CHECK (jsonb_typeof(allowed_mime_types) = 'array')
);

CREATE INDEX idx_reference_document_types_capture_mode ON reference_document_types (capture_mode);
CREATE INDEX idx_reference_document_types_is_active ON reference_document_types (is_active);
CREATE INDEX idx_reference_document_types_sort_order ON reference_document_types (sort_order);

CREATE TABLE chatbot_configuration (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key varchar(100) NOT NULL,
    config_group varchar(50) NOT NULL DEFAULT 'general',
    config_value jsonb NOT NULL,
    is_sensitive boolean NOT NULL DEFAULT false,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_chatbot_configuration_key UNIQUE (config_key)
);

CREATE INDEX idx_chatbot_configuration_group ON chatbot_configuration (config_group);
CREATE INDEX idx_chatbot_configuration_is_sensitive ON chatbot_configuration (is_sensitive);

CREATE TABLE chatbot_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid NOT NULL REFERENCES chatbot_workflows(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    language_code varchar(10) REFERENCES reference_languages(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    status varchar(30) NOT NULL DEFAULT 'awaiting_language',
    current_step varchar(30) NOT NULL DEFAULT 'ask_lang',
    draft_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    started_at timestamptz NOT NULL DEFAULT now(),
    last_activity_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    expired_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_chatbot_sessions_status CHECK (
        status IN (
            'awaiting_language',
            'awaiting_service',
            'awaiting_state',
            'awaiting_name',
            'awaiting_identity',
            'awaiting_documents',
            'awaiting_company_ppk',
            'awaiting_company_name',
            'awaiting_company_email',
            'awaiting_company_contact',
            'awaiting_company_state',
            'awaiting_company_category',
            'awaiting_company_director_name',
            'awaiting_company_director_ic',
            'awaiting_company_reason',
            'submitted',
            'under_review',
            'completed',
            'abandoned',
            'expired',
            'failed'
        )
    ),
    CONSTRAINT ck_chatbot_sessions_current_step CHECK (
        current_step IN (
            'ask_lang',
            'ask_service',
            'ask_state',
            'ask_name',
            'ask_ic',
            'ask_mobile',
            'ask_email',
            'ask_ic_copy',
            'ask_company_ppk',
            'ask_company_name',
            'ask_company_email',
            'ask_company_contact',
            'ask_company_state',
            'ask_company_category',
            'ask_company_director_name',
            'ask_company_director_ic',
            'ask_company_reason',
            'done'
        )
    ),
    CONSTRAINT ck_chatbot_sessions_draft_payload CHECK (jsonb_typeof(draft_payload) = 'object')
);

CREATE INDEX idx_chatbot_sessions_workflow_id ON chatbot_sessions (workflow_id);
CREATE INDEX idx_chatbot_sessions_language_code ON chatbot_sessions (language_code);
CREATE INDEX idx_chatbot_sessions_status ON chatbot_sessions (status);
CREATE INDEX idx_chatbot_sessions_current_step ON chatbot_sessions (current_step);
CREATE INDEX idx_chatbot_sessions_last_activity_at ON chatbot_sessions (last_activity_at);
CREATE INDEX idx_chatbot_sessions_started_at ON chatbot_sessions (started_at);

CREATE TABLE chatbot_applicants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL UNIQUE REFERENCES chatbot_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    -- The design doc specified full_name_ciphertext / full_name_hash /
    -- identity_number_ciphertext / identity_number_hash. That encryption design
    -- was never implemented: ApplicantService writes plaintext `full_name` and
    -- `identity_number` (see ApplicantService::updateIdentityFromSession), and
    -- ChatbotApplicantRepository::findByIdentityNumber queries `identity_number`
    -- directly. The columns below match the code.
    full_name text NOT NULL,
    identity_type varchar(20) NOT NULL,
    identity_number text NOT NULL,
    identity_number_last4 varchar(4),
    state_code varchar(10) NOT NULL REFERENCES reference_malaysian_states(state_code) ON DELETE RESTRICT ON UPDATE CASCADE,
    language_code varchar(10) NOT NULL REFERENCES reference_languages(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    verification_status varchar(20) NOT NULL DEFAULT 'pending',
    is_draft boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_chatbot_applicants_identity_type CHECK (identity_type IN ('MYKAD', 'PASSPORT')),
    CONSTRAINT ck_chatbot_applicants_verification_status CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    CONSTRAINT ck_chatbot_applicants_last4 CHECK (identity_number_last4 IS NULL OR identity_number_last4 ~ '^[A-Z0-9]{4}$')
);

CREATE INDEX idx_chatbot_applicants_identity_number ON chatbot_applicants (identity_number);
CREATE INDEX idx_chatbot_applicants_state_code ON chatbot_applicants (state_code);
CREATE INDEX idx_chatbot_applicants_language_code ON chatbot_applicants (language_code);
CREATE INDEX idx_chatbot_applicants_verification_status ON chatbot_applicants (verification_status);
CREATE INDEX idx_chatbot_applicants_created_at ON chatbot_applicants (created_at);

CREATE TABLE service_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_number varchar(40) NOT NULL,
    workflow_id uuid NOT NULL REFERENCES chatbot_workflows(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    session_id uuid NOT NULL UNIQUE REFERENCES chatbot_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    applicant_id uuid NOT NULL REFERENCES chatbot_applicants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    request_type_code varchar(30) NOT NULL REFERENCES reference_request_types(request_type_code) ON DELETE RESTRICT ON UPDATE CASCADE,
    status varchar(30) NOT NULL DEFAULT 'draft',
    submission_language_code varchar(10) NOT NULL REFERENCES reference_languages(code) ON DELETE RESTRICT ON UPDATE CASCADE,
    submitted_at timestamptz,
    latest_cims_status varchar(20) NOT NULL DEFAULT 'pending',
    final_outcome varchar(20),
    final_outcome_at timestamptz,
    closed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_service_requests_request_number UNIQUE (request_number),
    CONSTRAINT ck_service_requests_status CHECK (
        status IN (
            'draft',
            'submitted',
            'under_review',
            'pending_cims',
            'approved',
            'rejected',
            'manual_review',
            'cancelled',
            'failed'
        )
    ),
    CONSTRAINT ck_service_requests_latest_cims_status CHECK (latest_cims_status IN ('pending', 'deleted', 'linked', 'norecord', 'error', 'approved', 'rejected', 'manual_review')),
    CONSTRAINT ck_service_requests_final_outcome CHECK (final_outcome IS NULL OR final_outcome IN ('deleted', 'linked', 'norecord'))
);

CREATE INDEX idx_service_requests_workflow_id ON service_requests (workflow_id);
CREATE INDEX idx_service_requests_applicant_id ON service_requests (applicant_id);
CREATE INDEX idx_service_requests_request_type_code ON service_requests (request_type_code);
CREATE INDEX idx_service_requests_status ON service_requests (status);
CREATE INDEX idx_service_requests_latest_cims_status ON service_requests (latest_cims_status);
CREATE INDEX idx_service_requests_submitted_at ON service_requests (submitted_at);
CREATE INDEX idx_service_requests_created_at ON service_requests (created_at);

CREATE TABLE uploaded_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES chatbot_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    request_id uuid REFERENCES service_requests(id) ON DELETE CASCADE ON UPDATE CASCADE,
    document_type_code varchar(30) NOT NULL REFERENCES reference_document_types(document_type_code) ON DELETE RESTRICT ON UPDATE CASCADE,
    upload_source varchar(20) NOT NULL DEFAULT 'user_upload',
    storage_disk varchar(50) NOT NULL DEFAULT 'local',
    storage_path text NOT NULL,
    storage_file_name text NOT NULL,
    original_file_name_ciphertext bytea,
    mime_type varchar(100) NOT NULL,
    file_extension varchar(10) NOT NULL,
    file_size_bytes bigint NOT NULL,
    sha256_checksum char(64) NOT NULL,
    upload_status varchar(20) NOT NULL DEFAULT 'pending',
    security_status varchar(20) NOT NULL DEFAULT 'not_scanned',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_uploaded_documents_storage_path UNIQUE (storage_path),
    CONSTRAINT uq_uploaded_documents_storage_file_name UNIQUE (storage_file_name),
    CONSTRAINT ck_uploaded_documents_upload_source CHECK (upload_source IN ('user_upload', 'signature_pad', 'system_import')),
    CONSTRAINT ck_uploaded_documents_upload_status CHECK (upload_status IN ('pending', 'stored', 'quarantined', 'rejected', 'deleted')),
    CONSTRAINT ck_uploaded_documents_security_status CHECK (security_status IN ('not_scanned', 'clean', 'infected', 'error')),
    CONSTRAINT ck_uploaded_documents_file_size_bytes CHECK (file_size_bytes > 0),
    CONSTRAINT ck_uploaded_documents_metadata CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX idx_uploaded_documents_session_id ON uploaded_documents (session_id);
CREATE INDEX idx_uploaded_documents_request_id ON uploaded_documents (request_id);
CREATE INDEX idx_uploaded_documents_document_type_code ON uploaded_documents (document_type_code);
CREATE INDEX idx_uploaded_documents_sha256_checksum ON uploaded_documents (sha256_checksum);
CREATE INDEX idx_uploaded_documents_upload_status ON uploaded_documents (upload_status);
CREATE INDEX idx_uploaded_documents_security_status ON uploaded_documents (security_status);
CREATE INDEX idx_uploaded_documents_created_at ON uploaded_documents (created_at);

CREATE TABLE document_verifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    uploaded_document_id uuid NOT NULL REFERENCES uploaded_documents(id) ON DELETE CASCADE ON UPDATE CASCADE,
    verification_type varchar(30) NOT NULL,
    verifier varchar(30) NOT NULL,
    status varchar(20) NOT NULL,
    score numeric(5,2),
    reason_code varchar(50),
    reason_message text,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    verified_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_document_verifications_verification_type CHECK (verification_type IN ('file_integrity', 'mime_check', 'size_check', 'malware_scan', 'ocr_quality', 'signature_quality', 'manual_review')),
    CONSTRAINT ck_document_verifications_verifier CHECK (verifier IN ('system', 'agent', 'ai', 'cims')),
    CONSTRAINT ck_document_verifications_status CHECK (status IN ('pending', 'passed', 'failed', 'warning')),
    CONSTRAINT ck_document_verifications_score CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
    CONSTRAINT ck_document_verifications_details CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX idx_document_verifications_uploaded_document_id ON document_verifications (uploaded_document_id);
CREATE INDEX idx_document_verifications_verification_type ON document_verifications (verification_type);
CREATE INDEX idx_document_verifications_status ON document_verifications (status);
CREATE INDEX idx_document_verifications_verified_at ON document_verifications (verified_at);

CREATE TABLE cims_verification_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE ON UPDATE CASCADE,
    attempt_no integer NOT NULL,
    result_status varchar(20) NOT NULL,
    response_code varchar(50),
    response_message text,
    external_reference_no varchar(80),
    latency_ms integer,
    -- Written by VerificationService but absent from the design doc's DDL.
    retry_available boolean NOT NULL DEFAULT false,
    display_message text,
    response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_cims_verification_results_attempt UNIQUE (request_id, attempt_no),
    CONSTRAINT ck_cims_verification_results_attempt_no CHECK (attempt_no > 0),
    CONSTRAINT ck_cims_verification_results_result_status CHECK (result_status IN ('pending', 'deleted', 'linked', 'norecord', 'error', 'approved', 'rejected', 'manual_review')),
    CONSTRAINT ck_cims_verification_results_latency_ms CHECK (latency_ms IS NULL OR latency_ms >= 0),
    CONSTRAINT ck_cims_verification_results_response_payload CHECK (jsonb_typeof(response_payload) = 'object')
);

CREATE INDEX idx_cims_verification_results_request_id ON cims_verification_results (request_id);
CREATE INDEX idx_cims_verification_results_result_status ON cims_verification_results (result_status);
CREATE INDEX idx_cims_verification_results_created_at ON cims_verification_results (created_at);

CREATE TABLE chatbot_status_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid REFERENCES chatbot_sessions(id) ON DELETE SET NULL ON UPDATE CASCADE,
    request_id uuid REFERENCES service_requests(id) ON DELETE SET NULL ON UPDATE CASCADE,
    document_id uuid REFERENCES uploaded_documents(id) ON DELETE SET NULL ON UPDATE CASCADE,
    status_scope varchar(20) NOT NULL,
    from_status varchar(30),
    to_status varchar(30) NOT NULL,
    changed_by_type varchar(20) NOT NULL,
    changed_by_reference varchar(80),
    reason_code varchar(50),
    reason_message text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_chatbot_status_history_scope CHECK (status_scope IN ('session', 'request', 'document', 'cims')),
    CONSTRAINT ck_chatbot_status_history_changed_by_type CHECK (changed_by_type IN ('user', 'system', 'agent', 'integration')),
    CONSTRAINT ck_chatbot_status_history_entity_present CHECK (session_id IS NOT NULL OR request_id IS NOT NULL OR document_id IS NOT NULL),
    CONSTRAINT ck_chatbot_status_history_metadata CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX idx_chatbot_status_history_session_id ON chatbot_status_history (session_id);
CREATE INDEX idx_chatbot_status_history_request_id ON chatbot_status_history (request_id);
CREATE INDEX idx_chatbot_status_history_document_id ON chatbot_status_history (document_id);
CREATE INDEX idx_chatbot_status_history_status_scope ON chatbot_status_history (status_scope);
CREATE INDEX idx_chatbot_status_history_created_at ON chatbot_status_history (created_at);

CREATE TABLE chatbot_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
    session_id uuid REFERENCES chatbot_sessions(id) ON DELETE SET NULL ON UPDATE CASCADE,
    request_id uuid REFERENCES service_requests(id) ON DELETE SET NULL ON UPDATE CASCADE,
    event_type varchar(50) NOT NULL,
    severity varchar(10) NOT NULL,
    actor_type varchar(20) NOT NULL,
    actor_reference varchar(80),
    message text NOT NULL,
    masked_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip_hash bytea,
    user_agent_hash char(64),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_chatbot_audit_logs_severity CHECK (severity IN ('debug', 'info', 'warning', 'error', 'security')),
    CONSTRAINT ck_chatbot_audit_logs_actor_type CHECK (actor_type IN ('user', 'bot', 'agent', 'system', 'integration')),
    CONSTRAINT ck_chatbot_audit_logs_masked_payload CHECK (jsonb_typeof(masked_payload) = 'object')
);

CREATE INDEX idx_chatbot_audit_logs_correlation_id ON chatbot_audit_logs (correlation_id);
CREATE INDEX idx_chatbot_audit_logs_session_id ON chatbot_audit_logs (session_id);
CREATE INDEX idx_chatbot_audit_logs_request_id ON chatbot_audit_logs (request_id);
CREATE INDEX idx_chatbot_audit_logs_event_type ON chatbot_audit_logs (event_type);
CREATE INDEX idx_chatbot_audit_logs_severity ON chatbot_audit_logs (severity);
CREATE INDEX idx_chatbot_audit_logs_created_at ON chatbot_audit_logs (created_at);

CREATE TRIGGER trg_chatbot_workflows_updated_at
BEFORE UPDATE ON chatbot_workflows
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reference_languages_updated_at
BEFORE UPDATE ON reference_languages
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reference_malaysian_states_updated_at
BEFORE UPDATE ON reference_malaysian_states
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reference_request_types_updated_at
BEFORE UPDATE ON reference_request_types
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reference_document_types_updated_at
BEFORE UPDATE ON reference_document_types
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_chatbot_configuration_updated_at
BEFORE UPDATE ON chatbot_configuration
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_chatbot_sessions_updated_at
BEFORE UPDATE ON chatbot_sessions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_chatbot_applicants_updated_at
BEFORE UPDATE ON chatbot_applicants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_service_requests_updated_at
BEFORE UPDATE ON service_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_uploaded_documents_updated_at
BEFORE UPDATE ON uploaded_documents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
