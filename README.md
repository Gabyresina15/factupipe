# FactuPipe

MVP: PDF de factura argentina → texto (`pdf-parse`) → regex/Zod → MongoDB.
LLM HTTP **solo** si el extractor de reglas queda `partial`/`failed`.

No hay OCR GPU. No hay AFIP. No hay UI.

## Setup

```bash
git clone https://github.com/Gabyresina15/factupipe.git
cd factupipe
cp .env.example .env
# editá MONGODB_URI si hace falta
npm install
```

Mongo local:

```bash
# ejemplo
mongod --dbpath /data/db
npm run health
# OK Mongo
```

## Comandos

```bash
npm run health
npm run ingest -- ./samples/tu-factura.pdf
npm run list
npm run dev          # HTTP :3000
npm run watch        # inbox/ → processed/ | failed/
npm run demo         # batch samples/ + métrica
```

HTTP:

- `GET /health`
- `POST /ingest` `{ "path": "./samples/x.pdf" }`
- `GET /invoices?limit=50`
- `GET /invoices/:id`

## Demo d7

1. Copiá ≥10 PDFs texto-nativo a `./samples`.
2. `npm run demo`
3. Sale: `procesados=N clave>=80%=X% ms=T facturas/min=Y`

Idempotencia: el mismo PDF dos veces no duplica (`contentHash` sha256, `ingestCount++`).

## Limitaciones

- PDFs escaneados / foto → `failed` (fuera de scope: OCR).
- Regex cubre facturas AR típicas (CUIT, nro PPPP-NNNNNNNN, totales con coma).
- LLM es opcional (`LLM_API_KEY`). Sin key, solo reglas.
- No valida CAE contra ARCA.
