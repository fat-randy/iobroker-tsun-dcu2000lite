# ioBroker TSUN DCU2000Lite Cloud Adapter / Script

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![ioBroker](https://img.shields.io/badge/ioBroker-JavaScript-green.svg)](https://www.iobroker.net/)

[English](#english) | [Deutsch](#deutsch)

---

<a name="deutsch"></a>
## 🇩🇪 Beschreibung
Ein robustes JavaScript für **ioBroker**, das TSUN-Wechselrichter und DCU2000Lite Batteriespeicher über den offiziellen Cloud-Account (unterstützt auch den Installateur-Level / `identity_type: 2`) ausliest. 

Das Skript ermittelt die Stations-ID automatisch, filtert die physischen Speicher-Einheiten (`deviceType === 3`) heraus und legt eine strukturierte, zweisprachige (DE/EN) Datenpunkt-Hierarchie unter `0_userdata.0.tsun.` an.

### Features
* 🔐 **Automatischer OAuth2-Login** mit Token-Refresh-Handling.
* 🔍 **Vollautomatische Gerätedekodierung** anhand der echten Geräteseriennummern.
* 📊 **Umfassende Messwerte**: Batterie-SoC, Leistung, Spannung, Strom, Zellspannungen, SOH, PV1/PV2-Eingänge, Tages-/Gesamterträge sowie AC-Ausgangswerte.
* 🌐 **Bilinguale ioBroker-Objekte** (Deutsch / Englisch).
* ⏱️ **Konfigurierbares Abfrageintervall** (Standard: 60 Sekunden).

### Voraussetzungen
* ioBroker mit installierter **JavaScript-Instanz** (`javascript.0`).
* Aktive Node.js-Module im Skriptkontext aktiviert: `axios`, `crypto`, `querystring`.

### Installation & Einrichtung
1. Erstelle in ioBroker ein neues **JavaScript** (Typ: `Global` oder `Script`, z. B. im Ordner `PV`).
2. Kopiere den Code aus [`tsun_dcu_collector.js`](tsun_dcu_collector.js) in dein Skript.
3. Passe ganz oben im Skript deine Zugangsdaten an:
   ```javascript
   const TSUN_EMAIL = 'deine-email@domain.de';
   const TSUN_PASSWORD = 'dein-passwort';
   const POLL_INTERVAL_SECONDS = 60; // Abfrageintervall in Sekunden
