# STOZ Projectadministratie — Hybride Begrip

Webapplicatie voor de projectadministratie van het STOZ-subsidieproject "Hybride Begrip" bij Fysiotherapie Fy-fit.

## Kenmerken

- **Urenregistratie** met onveranderbare timestamps (RVO-auditproof)
- **Budget dashboard** met stoplichten (groen/oranje/rood)
- **Factuurbeheer** met PDF-uploads
- **Trainingsregistratie** met presentielijsten (printbaar)
- **Cliëntregistratie** (geanonimiseerd, Physitrack-gebruik)
- **CSV-export** voor RVO-verantwoording
- **Magic link authenticatie** (geen wachtwoorden)

## Tech Stack

- Next.js 14 (App Router)
- Prisma + PostgreSQL
- Tailwind CSS
- TypeScript

## Installatie

### 1. Prerequisites

- Node.js 18+
- PostgreSQL database

### 2. Setup

```bash
# Dependencies installeren
npm install

# Environment variabelen configureren
cp .env.example .env
# Pas DATABASE_URL aan naar je PostgreSQL database

# Database initialiseren
npx prisma db push

# Seed data laden (gebruikers, werkpakketten, budgetten)
npm run db:seed

# Development server starten
npm run dev
```

### 3. Inloggen

Open http://localhost:3000 en log in met een van de volgende e-mailadressen:

| Naam | Email | Rol |
|------|-------|-----|
| Luuk Smeekens | luuk.smeekens@outlook.com | Admin |
| Marion Brouwer | marion@fysiotherapienijmegen.nl | Intern |
| Sjoerd Hendriks | sjoerd@fysiotherapienijmegen.nl | Intern |
| Heidi Staring | heidi@fysiotherapienijmegen.nl | Intern |
| Lodewijk Tromp | ltromp@symbiomarketing.nl | Extern |
| Fysiotherapeuten Fy-fit | team@fysiotherapienijmegen.nl | Team |

In dev mode (`DEV_MODE=true`) wordt de magic link direct getoond op het loginscherm.

## Rollen

- **Admin**: Volledige toegang, uren goedkeuren, budget, trainingen, cliënten, export
- **Intern**: Eigen uren registreren en bekijken
- **Extern**: Eigen uren registreren, facturen uploaden
- **Team**: Gedeeld account voor fysiotherapeutenteam

## Werkpakketten

- WP1: Projectcoördinatie (A1.1 Projectmanagement, A1.2 Kick-off)
- WP2: Contentontwikkeling (A2.1 Technisch, A2.2 Teksten, A2.3 Video's)
- WP3: Scholing (A3.1 Training communicatie, A3.2 Instructie tools)
- WP4: Implementatie (A4.1 Pilot Meijhorst, A4.2 Uitrol praktijk)
- WP5: Verspreiding en borging (A5.1 Kennisdeling, A5.2 Opschaling)
- WP6: Monitoring en evaluatie (A6.1 Monitoring, A6.2 Evaluatie)

## RVO-compliance

- Alle registraties hebben een **onveranderbaar** `createdAt` tijdstempel
- Urenstatus doorloopt: Concept → Ingediend → Goedgekeurd
- Goedkeuringen zijn voorzien van datum en goedkeurder
- CSV-exports bevatten alle audit-relevante velden
- Facturen worden opgeslagen met origineel bestand

## Budget

| Categorie | Uren | Tarief | Totaal |
|-----------|------|--------|--------|
| Praktijkmanagers (Marion, Sjoerd, Heidi) | 490 | €50/uur | €24.500 |
| Fysiotherapeuten team | 60 | €50/uur | €3.000 |
| Front/backoffice | 20 | €50/uur | €1.000 |
| Luuk (extern) | 325 | €100/uur | €32.500 |
| Websitebouwer | 25 | €100/uur | €2.500 |
| Taalambassadeurs | 20 | — | — |
| **Totaal** | | | **€80.160** |

Subsidie: €39.410
