# FACTUPIPE.md

Motor: **QVAC local** (OCR_LATIN + Llama 3.2 1B) como en el backend del hackathon.
Arquitectura: rules-first + upsert hash. UI mínima de carga. AFIP live sigue afuera (validación fiscal ≠ extraer campos).

## Pipeline

archivo → extract (pdf-parse | qvac-ocr) → normalize regex → si partial: qvac completion → upsert Mongo

## Tracking

| Slice | Estado |
|-------|--------|
| 0-5 + 7-8 | DONE |
| 6 LLM | DONE — QVAC local, cloud opcional |
| OCR imagen | DONE — mismo SDK que ai-service.js |
| UI carga | DONE — GET / + POST /api/upload |
