# Prompt: Backend-Härtung + ZIP-Export/-Import

Diesen Prompt einfach in eine neue Claude-Code-Session einfügen, wenn die
Backend-Härtung und der ZIP-Export/-Import umgesetzt werden sollen. Er ist
so geschrieben, dass er auch mit frischem Kontext vollständig ist.

---

## Prompt (zum Kopieren)

```text
Kontext: Es geht um die „Design Reference"-Webapp in diesem Repo (React+Vite
Frontend auf :4200, Express-Backend in server/index.js auf :4300, alle Daten im
git-ignorierten data/-Ordner mit db.json). Arbeite auf dem Branch
claude/design-reference-webapp-kb3f8t, teste lokal wie gewohnt (playwright-core +
vorinstalliertes Chromium, Seed über die API, Screenshot prüfen), committe und
pushe am Ende mit dem üblichen Footer. UI-Texte auf Englisch. Keine neuen
npm-Abhängigkeiten. Sag mir am Schluss, ob ich node_modules neu installieren muss.

Setze folgende Verbesserungen um:

A) Datenverlust / Integrität (kritisch)
1. db.json atomar schreiben: erst in eine temporäre Datei schreiben, fsync, dann
   per rename ersetzen. Beim Start: wenn db.json fehlt oder korrupt ist
   (JSON.parse schlägt fehl), automatisch aus dem letzten guten Snapshot
   wiederherstellen statt mit leerer DB zu starten.
2. Die Write-Chain (mutateDB) absichern, damit EIN fehlgeschlagener Schreib-
   vorgang nicht alle folgenden dauerhaft blockiert (Fehler abfangen, Kette läuft
   weiter).
3. Graceful Shutdown: bei SIGTERM/SIGINT laufende Schreibvorgänge zu Ende laufen
   lassen, dann sauber beenden.
4. Rotierende db.json-Snapshots: bei jedem Schreiben die letzten N Versionen
   (z.B. 10) behalten (z.B. unter data/backups/), damit man zurück kann.

B) Robustheit / Performance
5. /api/storage: das folderSize-Ergebnis mit kurzer TTL cachen und bei
   Mutationen invalidieren, statt bei jedem Aufruf den ganzen data/-Baum zu
   scannen.
6. Beim Start verwaiste data/tmp/*-Ordner (abgebrochene Uploads) aufräumen.
7. Vor jedem rm/rename defensiv prüfen, dass der Zielpfad innerhalb von data/
   liegt (Path-Containment).

C) Export / Import als ZIP
8. Export: Endpoint + UI-Knopf, der die komplette Bibliothek (db.json + alle
   Dateien unter data/) als eine .zip zum Download liefert. Große Dateien
   (Videos) müssen funktionieren.
9. Import: Endpoint + UI-Knopf, der so eine .zip wieder einliest und die aktuelle
   Bibliothek ersetzt. Da destruktiv: vorher die aktuelle Bibliothek automatisch
   sichern, die ZIP validieren, bevor etwas überschrieben wird, und im UI eine
   klare Bestätigung verlangen.
10. ZIP direkt und ohne neue npm-Abhängigkeit implementieren, inklusive ZIP64,
    damit auch Dateien/Archive > 4 GB funktionieren. STORE-Methode verwenden
    (keine Kompression) — Videos/Bilder/PDFs sind bereits komprimiert, das spart
    CPU und macht den Writer robust; Dateigrößen vorab per stat lesen und Header
    direkt korrekt schreiben (keine Data-Descriptors), CRC32 beim Streamen
    berechnen. Für ZIP64: 32-Bit-Felder auf 0xFFFFFFFF setzen und die echten
    Werte ins ZIP64-Extra-Field (0x0001) legen, plus ZIP64-EOCD-Record +
    Locator vor dem normalen EOCD. Import muss Central Directory inkl.
    ZIP64-Records parsen können.

D) Struktur-Migration
11. Falls du für A–C eine robustere Backend-/Datenstruktur für sinnvoll hältst,
    setz sie NICHT einfach um. Beschreib mir vorher kurz, was du ändern willst
    und warum. Wenn ich zustimme, baue einen temporären „Migrate"-Knopf, der die
    bestehende Struktur einmalig, nicht-destruktiv und mit Backup davor in die
    neue umwandelt.

Teste alles lokal, inklusive einem Export -> Import Roundtrip (auch mit einer
Datei, die den ZIP64-Pfad auslöst), dann committen und pushen.
```

---

## Hintergrund zu einzelnen Punkten

- **Atomare Writes (A1):** Ein direkter `writeFile` auf `db.json` kann bei
  Absturz/Stromverlust mitten im Schreiben eine abgeschnittene, kaputte Datei
  hinterlassen — und damit die Metadaten der ganzen Bibliothek. `temp -> fsync
  -> rename` ist auf demselben Dateisystem atomar und verhindert das.

- **Write-Chain (A2):** Aktuell gilt `writeChain = writeChain.then(...)`. Wirft
  ein Mutator eine Exception, wird die Kette zu einem rejected Promise und
  ALLE folgenden Schreibvorgänge laufen nicht mehr, bis der Prozess neu startet
  (Lesen geht weiter). Deshalb Fehler abfangen, damit die Kette weiterläuft.

- **ZIP64 direkt (C10):** ZIP64 ist kein eigenes Format, sondern die normale
  ZIP-Struktur mit 64-Bit-Erweiterungsfeldern. Mit Node-Bordmitteln (`zlib` +
  eigenem CRC32) und der STORE-Methode gut ohne Abhängigkeit umsetzbar. Der
  Export (Schreiben) ist einfach; der Import (Central Directory inkl.
  ZIP64-Records parsen) ist der heiklere Teil und wird durch den
  Roundtrip-Test abgesichert.
