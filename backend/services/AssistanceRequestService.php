<?php

declare(strict_types=1);

namespace Cidb\Backend\Services;

use Cidb\Backend\Config\DatabaseConnection;
use Cidb\Backend\Repositories\ChatbotAssistanceRequestRepository;
use Cidb\Backend\Repositories\ChatbotSessionRepository;
use Cidb\Backend\Utils\Exceptions\AppException;
use Cidb\Backend\Utils\Logger;
use RuntimeException;
use Throwable;

final class AssistanceRequestService extends AbstractService
{
    /** Renewal types the RPA "cidb_masterbot" scenario accepts as sCustomerType. */
    private const RPA_TOPIC_CODES = ['PPK', 'SPKK', 'STB'];

    /** The RPA bot expects the spoken-language name in sLanguage, not the ISO code. */
    private const RPA_LANGUAGE_WORDS = ['ms' => 'Malay', 'en' => 'English'];

    public function __construct(
        DatabaseConnection $connection,
        private readonly ChatbotAssistanceRequestRepository $assistanceRequestRepository,
        private readonly ChatbotSessionRepository $sessionRepository,
        private readonly RpaBotService $rpaBotService,
        private readonly AuditService $auditService,
        private readonly Logger $logger
    ) {
        parent::__construct($connection);
    }

    public function submit(array $payload): array
    {
        $assistanceRequest = $this->transactional(function () use ($payload): array {
            $sessionId = $this->requireField($payload, 'session_id', 'SESSION_ID_REQUIRED');
            $applicantCategory = strtolower($this->requireField($payload, 'applicant_category', 'APPLICANT_CATEGORY_REQUIRED'));

            if (!in_array($applicantCategory, ['individual', 'company'], true)) {
                throw new AppException('Applicant category must be individual or company.', 422, 'APPLICANT_CATEGORY_INVALID', [
                    'applicant_category' => 'Applicant category must be individual or company.',
                ]);
            }

            $data = [
                'session_id' => $sessionId,
                'state' => $this->requireField($payload, 'state', 'STATE_REQUIRED'),
                'customer_name' => $this->requireField($payload, 'customer_name', 'CUSTOMER_NAME_REQUIRED'),
                'applicant_category' => $applicantCategory,
                'phone' => $this->requireField($payload, 'phone', 'PHONE_REQUIRED'),
                'email' => $this->requireField($payload, 'email', 'EMAIL_REQUIRED'),
                'enquiry_title' => $this->requireField($payload, 'enquiry_title', 'ENQUIRY_TITLE_REQUIRED'),
                'enquiry_description' => $this->requireField($payload, 'enquiry_description', 'ENQUIRY_DESCRIPTION_REQUIRED'),
                'id_number' => $this->requireField($payload, 'id_number', 'ID_NUMBER_REQUIRED'),
                'company_name' => null,
                'company_registration_no' => null,
                'cases_category' => $this->requireField($payload, 'cases_category', 'CASES_CATEGORY_REQUIRED'),
                'sub_category_1' => $this->requireField($payload, 'sub_category_1', 'SUB_CATEGORY_1_REQUIRED'),
                'sub_category_2' => $this->requireField($payload, 'sub_category_2', 'SUB_CATEGORY_2_REQUIRED'),
                'attachment_document_id' => trim((string) ($payload['attachment_document_id'] ?? '')) ?: null,
                'attachment_document_id_2' => trim((string) ($payload['attachment_document_id_2'] ?? '')) ?: null,
                'attachment_document_id_3' => trim((string) ($payload['attachment_document_id_3'] ?? '')) ?: null,
                'status' => 'new',
                'created_at' => $this->now(),
                'updated_at' => $this->now(),
            ];

            if ($applicantCategory === 'company') {
                $data['company_name'] = $this->requireField($payload, 'company_name', 'COMPANY_NAME_REQUIRED');
                $data['company_registration_no'] = $this->requireField($payload, 'company_registration_no', 'COMPANY_REGISTRATION_NO_REQUIRED');
            }

            $assistanceRequest = $this->assistanceRequestRepository->insert($data);

            $this->auditService->record('assistance_request_submitted', 'Assistance request submitted.', [
                'session_id' => $sessionId,
                'assistance_request_id' => $assistanceRequest['id'] ?? null,
                'applicant_category' => $applicantCategory,
            ], 'info', $sessionId);

            return $assistanceRequest;
        });

        // Best-effort: log the saved enquiry as a case through the RPA ticket-insert bot.
        // Runs outside the DB transaction and never throws — a failed trigger must not
        // lose the enquiry the customer already submitted.
        $this->triggerRpaEnquiry($assistanceRequest, $payload);

        return $assistanceRequest;
    }

    /**
     * @param array<string, mixed> $assistanceRequest The saved chatbot_assistance_requests row.
     * @param array<string, mixed> $payload           The original /assistance/submit payload.
     */
    private function triggerRpaEnquiry(array $assistanceRequest, array $payload): void
    {
        $assistanceRequestId = (string) ($assistanceRequest['id'] ?? '');
        $sessionId = (string) ($assistanceRequest['session_id'] ?? '');

        try {
            $rpaPayload = $this->buildEnquiryRpaPayload($assistanceRequest, $payload);
        } catch (RuntimeException $exception) {
            $this->logger->warning('Assistance enquiry RPA payload not ready; trigger skipped.', [
                'assistance_request_id' => $assistanceRequestId,
                'session_id' => $sessionId,
                'reason' => $exception->getMessage(),
            ]);

            return;
        }

        try {
            $botResult = $this->rpaBotService->triggerTicketInsert($rpaPayload);
        } catch (Throwable $throwable) {
            $this->logger->error('Assistance enquiry RPA trigger threw.', [
                'assistance_request_id' => $assistanceRequestId,
                'session_id' => $sessionId,
                'error' => $throwable->getMessage(),
            ]);
            $this->auditService->record('assistance_request_rpa_failed', 'Assistance enquiry RPA trigger threw an exception.', [
                'assistance_request_id' => $assistanceRequestId,
                'error' => $throwable->getMessage(),
            ], 'warning', $sessionId ?: null);

            return;
        }

        $success = (bool) ($botResult['success'] ?? false);

        $this->logger->info('Assistance enquiry RPA ticket-insert attempted.', [
            'assistance_request_id' => $assistanceRequestId,
            'session_id' => $sessionId,
            'success' => $success,
            'http_status' => $botResult['status_code'] ?? null,
            'duration_ms' => $botResult['duration_ms'] ?? null,
            'raw_response_text' => $botResult['raw_response_text'] ?? null,
        ]);

        $this->auditService->record(
            $success ? 'assistance_request_rpa_triggered' : 'assistance_request_rpa_failed',
            $success ? 'Assistance enquiry logged with the RPA bot.' : 'Assistance enquiry RPA trigger returned an error.',
            [
                'assistance_request_id' => $assistanceRequestId,
                'http_status' => $botResult['status_code'] ?? null,
                'error_message' => $botResult['error_message'] ?? null,
            ],
            $success ? 'info' : 'warning',
            $sessionId ?: null
        );
    }

    /**
     * Builds the RPA ticket-insert payload for a FAQ assistance enquiry.
     *
     * Shape mirrors VerificationService::buildBotPayload(): identical envelope and the
     * same eight `fields`. The only differences are sCustomerType (the PPK/SPKK/STB
     * renewal type instead of Individual/Company) and sLanguage (the spoken-language
     * word instead of the ISO code).
     *
     * @param array<string, mixed> $row     The saved chatbot_assistance_requests row.
     * @param array<string, mixed> $payload The original request payload.
     * @return array<string, mixed>
     *
     * @throws RuntimeException when a required value is missing (caller skips the trigger).
     */
    private function buildEnquiryRpaPayload(array $row, array $payload): array
    {
        $topicCode = strtoupper(trim((string) ($payload['topic_code'] ?? '')));
        if (!in_array($topicCode, self::RPA_TOPIC_CODES, true)) {
            throw new RuntimeException('missing or invalid topic_code (expected PPK, SPKK or STB)');
        }

        $fields = [
            'sCustomerType' => $topicCode,
            'sCustomerName' => trim((string) ($row['customer_name'] ?? '')),
            'sIdentificationNumber' => trim((string) ($row['id_number'] ?? '')),
            'sContactNumber' => trim((string) ($row['phone'] ?? '')),
            'sEmail' => trim((string) ($row['email'] ?? '')),
            'sLocationArea' => trim((string) ($row['state'] ?? '')),
            'sLanguage' => $this->resolveEnquiryLanguageWord($row, $payload),
            'sAttempt' => '1',
        ];

        $missing = array_keys(array_filter($fields, static fn (string $value): bool => $value === ''));
        if ($missing !== []) {
            throw new RuntimeException('empty RPA field(s): ' . implode(', ', $missing));
        }

        return [
            'company' => 'CIDB',
            'scenario_key' => 'cidb_masterbot',
            'channel' => 'Chatbot',
            'fields' => $fields,
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @param array<string, mixed> $payload
     */
    private function resolveEnquiryLanguageWord(array $row, array $payload): string
    {
        $code = strtolower(trim((string) ($payload['language_code'] ?? '')));

        if ($code === '') {
            $session = $this->sessionRepository->findById((string) ($row['session_id'] ?? ''));
            $code = strtolower(trim((string) ($session['language_code'] ?? '')));
        }

        return self::RPA_LANGUAGE_WORDS[$code] ?? 'English';
    }

    private function requireField(array $payload, string $field, string $errorCode): string
    {
        $value = trim((string) ($payload[$field] ?? ''));
        if ($value === '') {
            throw new AppException(sprintf('Field "%s" is required.', $field), 422, $errorCode, [
                $field => 'This field is required.',
            ]);
        }

        return $value;
    }
}
