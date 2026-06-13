# Development Journal

## KW 24

Gelernt:

- Browser senden keine einheitlichen MIME-Typen für Schriftdateien, was die Validierung von Schriftdatei-Uploads erschwert. Es existieren verschiedene MIME-Typen wie `font/*`, `application/font-*` oder `application/x-font-*`, abhängig von Browser und Betriebssystem. Allerdings hat Firefox unter Windows bei einem Test den generischen MIME-Typ `application/octet-stream` gesendet.

Herausforderungen:

- End-to-End-Tests mit Playwright zu implementieren, insbesondere die Authentifizierung über OpenID Connect (OIDC) in einem Docker-Setup, wobei der OIDC Mock server ausserhalb des Containers läuft. Claude Code fast nur zum Debuggen eingesetzt, warum es am Ende plötzlich funktionierte wusste selbst Claude nicht sicher.

Erkenntnisse:

- PNPM in Docker Builds zu verwenden ist nicht sehr angenehm. Das pnpm Docker Image enthält kein Node.js, das Node.js Image enthält kein pnpm.

Nächste Woche:

- ...
