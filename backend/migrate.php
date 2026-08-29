<?php

declare(strict_types=1);

use Cidb\Backend\Bootstrap\Bootstrap;
use Cidb\Backend\Migrations\MigrationManager;

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This script may only be run from the command line." . PHP_EOL);
    exit(1);
}

$basePath = dirname(__DIR__);

require $basePath . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';

$container = Bootstrap::create($basePath);

/** @var MigrationManager $manager */
$manager = $container->get(MigrationManager::class);

try {
    $applied = $manager->runPending();
} catch (Throwable $exception) {
    fwrite(STDERR, 'Migration failed: ' . $exception->getMessage() . PHP_EOL);
    exit(1);
}

if ($applied === []) {
    echo 'No pending migrations.' . PHP_EOL;
    exit(0);
}

foreach ($applied as $name) {
    echo 'Applied: ' . $name . PHP_EOL;
}

echo sprintf('%d migration(s) applied.%s', count($applied), PHP_EOL);
