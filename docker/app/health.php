<?php

declare(strict_types=1);

// Container-level liveness probe. Deliberately does not touch the database so
// that a database blip does not take the whole web container out of rotation.
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['status' => 'ok', 'service' => 'cidb-chatbot-app'], JSON_THROW_ON_ERROR);
