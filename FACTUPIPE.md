# FACTUPIPE.md

Scope: PDF factura → JSON → Mongo. Node/TS · pdf-parse · LLM solo PDFs sucios.

OUT: AFIP live, UI pesada, multi-empresa, OCR GPU, WhatsApp.

## Contrato

cuit | razonSocial | nroFactura | fecha | neto | iva | total | moneda | pathOrigen | contentHash | createdAt
+ status complete|partial|failed
+ extraction rules|llm|hybrid
+ ingestCount | updatedAt | rawText

## Tracking

| Slice | Estado |
|-------|--------|
| 0 Inventario | DONE |
| 1 Scaffold + health | DONE |
| 2 Ingest 1 PDF | DONE |
| 3 Normalizer reglas | DONE |
| 4 Hash + upsert | DONE |
| 5 List/GET | DONE |
| 6 LLM solo sucios | DONE |
| 7 Watcher | DONE |
| 8 Demo pack | DONE (falta que cargues ≥10 PDFs en samples/) |
