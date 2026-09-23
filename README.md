# FactuPipe

Pipeline **100% local** para facturas argentinas.

1. PDF nativo → `pdf-parse`
2. Foto / PDF sucio → OCR QVAC (RTX)
3. Campos → regex + Zod
4. Huecos → Llama 3.2 1B **en tu máquina** (`@qvac/sdk`)
5. Mongo upsert por `contentHash` sha256

No hay OpenAI, no hay `LLM_API_KEY`, no hay llamada a internet para extraer campos.
Si QVAC no carga o no arma JSON, se queda el resultado de reglas. Punto.

## Setup

```bash
git clone https://github.com/Gabyresina15/factupipe.git
cd factupipe
git pull
cp .env.example .env
npm install
npm run dev
```

http://localhost:3000 — subís PDF o foto.
`GET /health` → `{ mongo, qvac }`.

## Comandos

```bash
npm run health
npm run ingest -- ./samples/factura.pdf
npm run list
npm run watch
npm run demo
```

## Siguiente slice (no implementado aún)

Validación AFIP/ARCA del CAE / CUIT contra el fisco. Eso es otra capa: consulta WSAA/WSFE, no extrae el PDF.
