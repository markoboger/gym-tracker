# 💪 HappyFit Workout Tracker

Ein reiner Frontend-Workout-Tracker für Marko Boger als Ersatz für das Google Spreadsheet "HappyFit". Alle Daten werden lokal im Browser gespeichert (localStorage). Keine Backend-Komponente, keine Datenbank, keine Authentifizierung erforderlich.

## Features

- ✅ **Client-Only**: Läuft komplett im Browser, keine Server-API nötig
- 📱 **Mobile-First**: Optimiert für iPhone, funktioniert auch auf Desktop
- 🎯 **Schnelles Logging**: Mit einem Tap Übung als "erledigt" markieren
- 📊 **21 Übungen**: Alle Geräte aus dem HappyFit-Spreadsheet vorgeladen
- 💾 **LocalStorage**: Workouts werden automatisch im Browser gespeichert
- 📤 **Export/Import**: JSON-Export für Backup und Migration
- 🌙 **Dark Mode**: iOS-ähnliches dunkles Design
- 📅 **Verlauf**: Alle vergangenen Trainings einsehen und bearbeiten

## Übungen aus HappyFit

Die App enthält alle Übungen aus dem `202627` Sheet mit den aktuellen Gewichten, Sets und Reps:

| Nr | Übung | Gewicht (kg) | Sets | Reps/Min |
|----|-------|--------------|------|----------|
| - | Rudern (Cardio) | 15 | 10 Min | + Meter |
| 18 | Butterfly | 45 | 2 | 15 |
| 19 | Butterfly reverse | 35 | 3 | 8 |
| 21 | Bauch Crunch | 85 | 2 | 15 |
| 22 | Rückenstrecker | 85 | 2 | 15 |
| 23 | Preacher | 35 | 2 | 12 |
| 24 | Rotationsmaschine | 70 | 2 | 15 |
| 26 | Klimmzüge unterst. | 65 | 2 | 15 |
| 29 | Seitenhebemaschine | 35 | 2 | 15 |
| 33 | Beinstrecker | 60 | 2 | 12 |
| 35 | Adduktion | 109 | 3 | 12 |
| 36 | Abduktion | 93 | 3 | 12 |
| 49/50 | Hyperextensions | 15 | 3 | 8 |
| 55 | Hack Squat | 0 | 2 | 6 |
| 62 | T-Bare | 25 | 3 | 8 |
| 68 | Brustpresse liegend | 7 | 3 | 8 |
| frei | Klimmzüge | 6 | 3 | 12 |
| - | Bauchtrainer | 0 | 2 | 15 |
| Kabelzug | Hor. Außenrotation | 10 | 2 | 12 |
| Functional | Beinheben mit Schlaufen | 0 | 3 | 10 |
| Sauna | Schneidersitz | 0 | 2 Min | - |

## Installation & Start

```bash
# Dependencies installieren
npm install

# Development Server starten
npm run dev

# Production Build
npm run build
```

Der Dev-Server läuft auf Port **5874** und ist per `--host true` im lokalen Netzwerk erreichbar.

## Verwendung auf dem iPhone

### Option 1: Lokales Netzwerk (am einfachsten)

1. Stelle sicher, dass dein iPhone und dein Computer im **gleichen WLAN** sind
2. Starte den Dev-Server: `npm run dev`
3. Notiere die **lokale IP-Adresse**, die Vite ausgibt (z.B. `http://192.168.1.42:5874`)
4. Öffne Safari auf dem iPhone und gib die URL ein
5. Optional: Über "Teilen" → "Zum Home-Bildschirm" als Web-App hinzufügen

### Option 2: Production Build hosten

```bash
npm run build
# Dann den dist/ Ordner auf einem Webserver deiner Wahl hosten
```

### Als Web-App installieren

1. Öffne die App in Safari
2. Tippe auf das "Teilen"-Symbol (Quadrat mit Pfeil)
3. Scrolle nach unten und wähle **"Zum Home-Bildschirm"**
4. Die App verhält sich jetzt wie eine native App (kein Browser-UI)

## Datenstruktur

### LocalStorage

Die App speichert alle Sessions im localStorage unter dem Key `happyfit-sessions` als JSON-Array:

```json
[
  {
    "date": "2025-10-29",
    "workouts": [
      {
        "equipmentId": 1,
        "name": "Rudern",
        "nr": "",
        "kg": 15,
        "sets": 1,
        "reps": 0,
        "minutes": 10,
        "meters": 2500,
        "isCardio": true,
        "isSauna": false,
        "completed": true
      }
    ]
  }
]
```

### Equipment-Daten

Die Geräte-Defaults sind in `src/data/equipment.json` gespeichert und wurden aus dem `HappyFit.xlsx` Sheet `202627` geparst.

**Mapping HappyFit → UI:**

- **Nr** (Spalte A) → Gerätenummer in der UI
- **kg** (Spalte B) → Default-Gewicht
- **Übung** (Spalte C) → Name der Übung
- **Sets** (Spalte D) → Default Sets
- **Reps** (Spalte E) → Default Reps/Minuten

Für **Rudern** werden zusätzlich Minuten und Meter erfasst.  
Für **Sauna Schneidersitz** werden nur Minuten erfasst.

## Bedienung

### Heutiges Training

- **✓-Button**: Übung mit aktuellen Werten als erledigt markieren (1 Tap)
- **+/− Buttons**: Gewicht, Sets, Reps anpassen (Gewicht in 2.5kg-Schritten)
- **↶-Button**: Übung als "nicht erledigt" zurücksetzen
- Automatisches Speichern bei jeder Änderung

### Verlauf

- **"Verlauf"**: Alle bisherigen Trainings chronologisch anzeigen
- **Tap auf Session**: Altes Training ansehen/bearbeiten
- **Export**: Alle Daten als JSON herunterladen
- **Import**: JSON-Datei hochladen und Daten wiederherstellen
- **Reset**: Alle Daten löschen (Vorsicht!)

## Daten zurücksetzen

```javascript
// Im Browser DevTools Console:
localStorage.removeItem('happyfit-sessions')
location.reload()
```

Oder über die App: **Verlauf → Reset**

## Technische Details

- **Framework**: Vue 3 (Composition API)
- **Build Tool**: Vite
- **Styling**: Vanilla CSS mit iOS-ähnlichen Design-Tokens
- **Storage**: Browser localStorage (kein Backend)
- **Mobile Features**: 
  - Safe-Area-Insets für iPhone Notch
  - Touch-optimierte Buttons (44×44px Mindestgröße)
  - viewport-fit=cover für Fullscreen
  - Web App Manifest für Add-to-Home-Screen

## Entwicklung

```bash
# Dependencies aktualisieren
npm update

# Linting (falls später hinzugefügt)
npm run lint
```

## Troubleshooting

**Problem**: App lädt nicht auf iPhone über lokale IP  
→ Firewall prüfen, sicherstellen dass beide Geräte im gleichen Netz sind

**Problem**: Daten verschwinden nach Browser-Update  
→ Regelmäßig Export machen als Backup

**Problem**: localStorage voll  
→ Alte Sessions manuell löschen oder exportieren und Reset machen

## Lizenz

Persönliches Projekt für Marko Boger.
