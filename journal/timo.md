# Development Journal

## KW 24

Gelernt:

- Browser senden keine einheitlichen MIME-Typen für Schriftdateien, was die Validierung von Schriftdatei-Uploads erschwert. Es existieren verschiedene MIME-Typen wie `font/*`, `application/font-*` oder `application/x-font-*`, abhängig von Browser und Betriebssystem. Allerdings hat Firefox unter Windows bei einem Test den generischen MIME-Typ `application/octet-stream` gesendet.

Herausforderungen:

- End-to-End-Tests mit Playwright zu implementieren, insbesondere die Authentifizierung über OpenID Connect (OIDC) in einem Docker-Setup, wobei der OIDC Mock server ausserhalb des Containers läuft. Claude Code fast nur zum Debuggen eingesetzt, warum es am Ende plötzlich funktionierte wusste selbst Claude nicht sicher.

Erkenntnisse:

- PNPM in Docker Builds zu verwenden ist nicht sehr angenehm. Das pnpm Docker Image enthält kein Node.js, das Node.js Image enthält kein pnpm. Trick: PNPM binary aus dem pnpm Image kopieren und in einem Node.js Image verwenden. Siehe Dockerfile.
- E2E-Tests für alle grundlegenden Operationen mit Claude Code generiert. Das Debugging warum einzelne Tests nicht erfolgreich waren hat einiges an Zeit gekostet. Allerdings konnte ein Bug im Backend wodurch leere Ordner wie Dateien behandelt wurden gefunden und behoben werden.

# KW 26

Herausforderungen:

- Marp hat leider keine TypeScript Types für die Plugin-API. Claude war allerdings in der Lage sich den Marp-Quelltext anzusehen um ein Plugin zu generieren, mit dem die URL von eingebetteten Bildern in den Folien modifiziert werden kann.
