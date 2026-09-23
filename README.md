# FactuPipe

Pipeline local para facturas argentinas.

1. **PDF nativo** → `pdf-parse`
2. **Foto / PDF sucio** → OCR QVAC (mismo motor que tu `ai-service.js`, RTX)
3. **Campos** → regex + Zod (CUIT, nro, fechas, totales AR)
4. **Huecos** → Llama 3.2 1B **local** via `@qvac/sdk` (cloud solo si QVAC no arranca y hay `LLM_API_KEY`)
5. **Mongo** upsert por `contentHash` sha256

UI mínima en `GET /` para subir PDF o imagen.

## Setup

```bash
git clone https://github.com/Gabyresina15/factupipe.git
cd factupipe
git pull
cp .env.example .env
npm install
```

Mongo local + GPU con drivers que QVAC ya te andaba en el hackathon.

```bash
npm run health    # mongo + flag qvac
npm run dev       # http://localhost:3000  (carga OCR+LLM al boot)
```

Primera corrida QVAC descarga pesos. Después quedan cacheados.

## Flujo

```bash
npm run ingest -- ./samples/factura.pdf
npm run ingest -- ./uploads/foto.jpg
npm run list
npm run watch     # inbox/ → processed|failed
npm run demo
```

HTTP:

- `GET /` UI carga
- `POST /api/upload` multipart campo `factura`
- `POST /ingest` `{ "path": "./archivo.pdf" }`
- `GET /invoices?limit=`
- `GET /invoices/:id`
- `GET /health` `{ mongo, qvac }`

Apagar local: `QVAC_ENABLED=0` en `.env`.

## Idempotencia

Mismo archivo 2 veces → 1 documento, `ingestCount++`.

## Qué no es

No pega a ARCA/AFIP a validar CAE. Extrae el PDF/foto y lo persiste.
Si querés esa capa, es otro slice después del MVP de extracción.
