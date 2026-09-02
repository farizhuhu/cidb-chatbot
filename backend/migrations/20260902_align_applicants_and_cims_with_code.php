<?php

declare(strict_types=1);

namespace Cidb\Backend\Migrations;

use PDO;

/**
 * Repairs databases created from the original baseline schema, which was
 * extracted from BACKEND_DATABASE_DESIGN.md section 11 and diverged from the
 * code in two places:
 *
 *  - chatbot_applicants specified full_name_ciphertext / full_name_hash /
 *    identity_number_ciphertext / identity_number_hash. That encryption design
 *    was never implemented — ApplicantService writes plaintext `full_name` and
 *    `identity_number` — so every identity save failed with
 *    `column "full_name" ... does not exist`.
 *
 *  - cims_verification_results lacked retry_available and display_message,
 *    both written by VerificationService on every verification attempt.
 *
 * docker/db/initdb/ only runs against an empty data directory, so an existing
 * deployment can only be repaired by a migration. Every statement is written to
 * be safe on a database that is already correct, so this is a no-op there.
 */
final class AlignApplicantsAndCimsWithCode extends AbstractMigration
{
    public function name(): string
    {
        return '20260902_align_applicants_and_cims_with_code';
    }

    public function up(PDO $pdo): void
    {
        // --- chatbot_applicants -------------------------------------------
        $this->executeStatements($pdo, [
            'ALTER TABLE chatbot_applicants ADD COLUMN IF NOT EXISTS full_name text',
            'ALTER TABLE chatbot_applicants ADD COLUMN IF NOT EXISTS identity_number text',
            // Unsatisfiable once the hash columns are gone.
            'ALTER TABLE chatbot_applicants DROP CONSTRAINT IF EXISTS ck_chatbot_applicants_identity_hash_length',
        ]);

        // Carry across any rows that predate this migration. Inserts against the
        // old shape always failed, so in practice there are none — but a row
        // written some other way must not be silently emptied.
        $this->copyIfPresent($pdo, 'full_name_ciphertext', 'full_name');
        $this->copyIfPresent($pdo, 'identity_number_ciphertext', 'identity_number');

        // The legacy columns are NOT NULL, so leaving them in place would keep
        // every insert failing. Drop them when the table holds no data; when it
        // does, only relax the constraint so nothing is lost.
        $hasRows = (int) $pdo->query('SELECT count(*) FROM chatbot_applicants')->fetchColumn() > 0;
        $legacy = [
            'full_name_ciphertext',
            'full_name_hash',
            'identity_number_ciphertext',
            'identity_number_hash',
        ];

        foreach ($legacy as $column) {
            if (!$this->columnExists($pdo, 'chatbot_applicants', $column)) {
                continue;
            }

            $pdo->exec($hasRows
                ? sprintf('ALTER TABLE chatbot_applicants ALTER COLUMN %s DROP NOT NULL', $column)
                : sprintf('ALTER TABLE chatbot_applicants DROP COLUMN %s', $column));
        }

        $this->executeStatements($pdo, [
            "UPDATE chatbot_applicants SET full_name = '' WHERE full_name IS NULL",
            "UPDATE chatbot_applicants SET identity_number = '' WHERE identity_number IS NULL",
            'ALTER TABLE chatbot_applicants ALTER COLUMN full_name SET NOT NULL',
            'ALTER TABLE chatbot_applicants ALTER COLUMN identity_number SET NOT NULL',
            'CREATE INDEX IF NOT EXISTS idx_chatbot_applicants_identity_number ON chatbot_applicants (identity_number)',
        ]);

        // --- cims_verification_results ------------------------------------
        $this->executeStatements($pdo, [
            'ALTER TABLE cims_verification_results ADD COLUMN IF NOT EXISTS retry_available boolean NOT NULL DEFAULT false',
            'ALTER TABLE cims_verification_results ADD COLUMN IF NOT EXISTS display_message text',
        ]);
    }

    public function down(PDO $pdo): void
    {
        // Deliberately not reversible: restoring the ciphertext/hash columns
        // would reintroduce a shape the application cannot write to.
    }

    private function columnExists(PDO $pdo, string $table, string $column): bool
    {
        $statement = $pdo->prepare(
            'SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c'
        );
        $statement->execute(['t' => $table, 'c' => $column]);

        return $statement->fetchColumn() !== false;
    }

    private function copyIfPresent(PDO $pdo, string $from, string $to): void
    {
        if (!$this->columnExists($pdo, 'chatbot_applicants', $from)) {
            return;
        }

        $pdo->exec(sprintf(
            'UPDATE chatbot_applicants SET %s = encode(%s, \'escape\') WHERE %s IS NULL',
            $to,
            $from,
            $to
        ));
    }
}
