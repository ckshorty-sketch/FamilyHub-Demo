# FamilyHub-Demo

Eine eigenständige, interaktive Browser-Demo für den Familienalltag. Sie läuft ohne Nextcloud und startet mit der frei erfundenen Familie Sommer.

- [Öffentliche Demo](https://familyhub-demo-ckshorty.woodyrhino4.chatgpt.site)
- [GitHub-Repository](https://github.com/ckshorty-sketch/FamilyHub-Demo)

## Ausprobieren

Über die Profilauswahl oben rechts lässt sich jederzeit die Perspektive wechseln. Das ist eine Simulation und keine Anmeldung oder Zugriffssicherung.

| Profil | Perspektive |
| --- | --- |
| Anna und Tom | Eltern: Aufgaben und Termine verwalten, Erledigungen und Wünsche freigeben, Punkte korrigieren, Familienregeln ändern |
| Lina, 12 Jahre | Kind: passende Aufgaben übernehmen und fertigmelden, Belohnungen anfragen, einkaufen helfen |
| Ben, 9 Jahre | Kind mit anderen Aufgabenstufen und eigenem Wochenziel |
| Küchenanzeige | Gemeinsame Übersicht ohne Schreibzugriff; optional im Vollbild |

Ein kurzer Rundgang stellt die Abläufe vor. Für einen vollständigen Aufgabenablauf als Kind eine offene Aufgabe übernehmen und fertigmelden, danach als Elternteil freigeben. Die Punkte stehen anschließend für einen Belohnungswunsch zur Verfügung.

## Funktionen

| Bereich | Möglichkeiten |
| --- | --- |
| Überblick | Tagesplan, Aufgaben, offene Freigaben und Wochenfortschritt |
| Kalender | Monats-, Wochen- und Listenansicht; persönliche Farben; einmalige und wiederkehrende Termine; Ganztagstermine |
| Aufgaben | Anlegen und bearbeiten, Schwierigkeitsstufen, Wiederholungen, Übernehmen, Fertigmelden und Elternfreigabe; Serien pausieren oder beenden |
| Belohnungen | Wünsche verwalten, mit Punkten anfragen, bestätigen oder ablehnen; nachvollziehbares Punktejournal |
| Einkaufslisten | Mehrere Listen, Kategorien, Mengen und abgehakte Artikel |
| Fairness | Persönliche Wochenziele in **Aufgabenpunkten**, Beiträge je freigegebener Schwierigkeitsstufe und einmaliger Wochenbonus |
| Familie | Profile, Rollen, Kalenderfarben, erlaubte Aufgabenstufen und persönliche Wochenziele |
| Küchenansicht | Uhr, Termine, Aufgaben, Punkte und Einkauf auf einem gemeinsamen Bildschirm |
| Demo & Einstellungen | Familienregeln, Rundgang, JSON-Export und -Import sowie Zurücksetzen |

Wiederkehrende Aufgaben erzeugen einzelne Vorgänge. Bestätigte Erfolge behalten ihre damaligen Werte; eine erneute Freigabe schreibt keine zusätzlichen Punkte gut. Belohnungsanfragen reservieren die benötigten Punkte sofort. Eine Ablehnung gibt sie einmalig zurück. Manuelle Punktekorrekturen benötigen eine Begründung.

## Daten und Simulationen

Änderungen werden im `localStorage` dieses Browsers gespeichert und bleiben beim Neuladen erhalten. Andere Besucher, Browser oder Geräte haben einen eigenen Datenstand. Es gibt keine gemeinsame Datenbank, keine Synchronisierung, keine echten Benutzerkonten und keine Verbindung zu Nextcloud.

Der Google-Kalenderimport fügt ausschließlich fiktive Beispieltermine hinzu. Die Wetteranzeige zeigt gekennzeichnete Beispieldaten. Terminerinnerungen lassen sich einstellen, versenden aber keine echten Benachrichtigungen. Es werden keine Google-, Wetter- oder anderen Konten verbunden.

Unter **Demo & Einstellungen** lässt sich der aktuelle Stand als JSON-Datei sichern. Ein Import wird geprüft und ersetzt nach Bestätigung den lokalen Stand. **Demo zurücksetzen** stellt die Beispielfamilie wieder her. Browserdaten können auch vom Browser gelöscht werden; wichtige Vorführungsstände vorher exportieren. Die Demo ist für fiktive Daten gedacht.

## Lokal starten und prüfen

Die Anwendung besteht aus statischen Dateien und nativen ES-Modulen. Ein Frontend-Build ist nicht nötig. Vom Repository-Verzeichnis aus:

```sh
python3 -m http.server 8080 --directory dist
```

Anschließend `http://localhost:8080` öffnen. Für die automatisierten Modell- und DOM-Tests wird eine aktuelle Node.js-Version benötigt:

```sh
npm ci
npm run check
npm test
```

Die Laufzeit der Demo benötigt keine npm-Pakete oder externen Schrift- und Icon-Dienste. Entwicklungsabhängigkeiten dienen ausschließlich den Tests.

## Veröffentlichung

Die statischen Dateien liegen in `dist/`. `.openai/hosting.json` enthält die bestehende Sites-Projektzuordnung und das Veröffentlichungsverzeichnis. Für Sites wird der identische Git-Commit in das registrierte Quellrepository übertragen und ein Archiv mit `.openai/hosting.json` sowie `dist/` veröffentlicht. Zugangsdaten gehören weder in das Repository noch in das Archiv.

Die Nextcloud-App wird getrennt entwickelt; diese Demo installiert oder verändert nichts auf einem Nextcloud-Server.

## Lizenz

GNU Affero General Public License, Version 3 oder neuer (`AGPL-3.0-or-later`). Der vollständige Lizenztext steht in [LICENSE](LICENSE).
