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

- Next.js 16 (App Router)
- Prisma + PostgreSQL
- Tailwind CSS
- TypeScript

## Installatie

### 1. Prerequisites

- Node.js 20.9+
- PostgreSQL database

### 2. Setup

```bash
# Dependencies installeren
npm install

# Environment variabelen configureren
cp .env.example .env
# Pas DATABASE_URL aan naar je PostgreSQL database

# Prisma Client genereren en gecontroleerde migraties toepassen
npx prisma generate
npx prisma migrate deploy

# Seed data laden (gebruikers, werkpakketten, budgetten)
npm run db:seed

# Development server starten
npm run dev
```

### 3. Inloggen

Open http://localhost:3000 en vraag met een actief, vooraf geregistreerd e-mailadres een magic link aan. SMTP-configuratie is verplicht; loginlinks en gebruikerslijsten worden nooit door een ontwikkelroute getoond.

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

- Alle registraties hebben een onveranderd `createdAt`-tijdstempel; correcties op goedgekeurde uren bewaren before/after, reden, actor en tijdstip
- Urenstatus doorloopt: Concept → Ingediend → Goedgekeurd
- Goedkeuringen zijn voorzien van datum en goedkeurder
- CSV-exports bevatten alle audit-relevante velden
- Facturen worden opgeslagen met origineel bestand

## Financiële basis

- Verleende subsidiabele kostenbasis: **€78.820**
- Maximale subsidie: **€39.410**
- De ingediende werkmap van €80.160 is niet de financiële bovenlaag
- Zolang de afzonderlijke aangepaste RVO-XLSX ontbreekt, blijft de begrotingsbron in de applicatie zichtbaar als gereconstrueerd
- Facturen tellen pas mee na auditbare begrotingskoppeling; btw blijft afzonderlijk geblokkeerd totdat de behandeling expliciet is bevestigd
- Externe urenwaarde en factuurbedrag worden nooit bij elkaar opgeteld
