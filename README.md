# FactuPipe

Extractor local de facturas argentinas: PDF o foto → JSON (CUIT, razón social, número, fecha, neto, IVA, total, moneda, CAE) en Mongo. Sin API paga ni internet.

**Problema:** los comprobantes llegan como PDF, escaneo o foto, y el OCR se come dígitos (`30-00000000-7` → `300o0c0o007`). Mejor un campo vacío y marcado que un dato inventado.

```mermaid
flowchart LR
  A[Texto<br/>pdf-parse u OCR QVAC] --> B[Reglas regex<br/>+ checksum CUIT]
  B --> C[Llama 3.2 1B local<br/>completa razón social / total si faltan]
  C --> D[(Mongo<br/>upsert por sha256)]
```

## Decisiones

**Reglas primero.** `normalize.ts` extrae con regex, determinista y testeable sin GPU. El 1B completa solo lo que falta (`total: rules.total ?? llmTotal`), así que nunca pisa un total que las reglas ya encontraron. Hoy el 1B se llama siempre que hay texto, aunque las reglas ya hayan encontrado todo. Pendiente: no llamarlo cuando la factura ya es `complete`.

**CUIT.** Si trae una letra donde va un dígito o no cierra el módulo 11, queda `cuit: null` con `warnings: ["cuit_checksum"]`. Las letras no se convierten en cero, y un resultado 10 se trata como inválido. Solo se toma el CUIT etiquetado como tal; aun así, un OCR que cambia dígitos puede dar por casualidad un CUIT válido.

**1B local, no nube.** Sin costo variable y los datos no salen de la máquina. Debilidad real: un 1B no devuelve JSON estable. Se le piden solo dos claves (`merchantName`, `totalAmount`), el JSON se repara con tolerancia y, si falla, quedan las reglas.

**Mongo.** Documento variable (`rawText`, campos opcionales, `warnings`), sin joins. Postgres con JSONB también serviría.

**Idempotencia.** Clave: sha256 del archivo, índice único. Una factura `complete` no se pisa: el job queda `done` con `skipped: true` y sube `ingestCount`. Un reintento peor (menos campos clave, u OCR vacío) solo llena huecos; uno igual o mejor actualiza.

**Jobs.** Cada ingesta es un job `queued → running → done | failed` (`GET /jobs/:id`), procesado por un único worker, de a una factura.
- **Timeout** (`JOB_TIMEOUT_MS`, 120 s por defecto): el job queda `failed` con `errorCode: "timeout"`. La operación no se cancela, pero un resultado tardío no se escribe.
- **Reinicio:** un job `running` queda `failed` con `errorCode: "process_restarted"` (a propósito, no se sabe hasta dónde llegó). Los `queued` se retoman en orden.
- **OCR colgado:** los jobs siguientes con OCR vencen hasta reiniciar el proceso. No hay estado "qvac stuck".

## Observabilidad

Una línea JSON por factura en stdout, incluidas `skipped`, `failed` y `timeout` (no la de un job cortado por reinicio):
- identificación: `ts`, `jobId`, `contentHash`;
- resultado: `outcome`, `errorCode`, `skipped`, `status`, `extraction`, `extractSource`;
- tiempos: `ocrMs`, `llmCalled`, `llmMs`, `totalMs`;
- calidad: `fieldsHit` (de 5 campos clave) y `fieldsPct`;
- latencia: `p95Ms` y `n`.

`totalMs` es el tiempo en el worker, sin cola. `p95Ms` cubre las últimas 200 facturas en memoria del proceso: se reinicia con él y no sale de Mongo. No se loguean `rawText` ni CUIT.

## Qué no hace

- No consulta AFIP/ARCA en vivo ni valida el CAE: el CAE solo se extrae del texto.
- No es multi-tenant ni tiene autenticación.
- No usa Redis ni una cola aparte del worker del proceso.
- No tiene fine-tune.

## Límites (B8)

- **Letra del comprobante:** manda el código AFIP (`COD. 01/06/11`…), después "FACTURA A/B/C". Si no hay ninguno legible, "Responsable Monotributo" en el bloque del emisor (antes de los datos del receptor) indica C. Una Factura A/B a un receptor monotributista no se lee como C. Riesgo: un código de producto tipo "Cod. 12" antes del encabezado se leería como letra.
- **Factura C:** IVA 0 y neto = total; un "IVA" leído en una C se descarta. Lo testean el golden arca-c y un caso sintético.
- **USD:** `total` es el de USD y `moneda: "USD"`. `tipoCambio` sale solo de una etiqueta ("Tipo de cambio", "Cotización", "T.C.", "TC") seguida de un número limpio (`1.234,56`, `1234.56`, `65,00`). Si el número viene pegado a letras o seguido de basura de OCR, queda `null`: no se pliegan letras a dígitos. `totalArs = total × tipoCambio` (2 decimales) solo si existen los dos; en facturas ARS no se calcula.
- **Golden Líder:** en el `rawText` el tipo de cambio sale `65 oo]j0` con la etiqueta ilegible, así que `tipoCambio` y `totalArs` quedan `null` (el papel dice 65 y 786500).
- **EUR:** un `€` pegado al número no se detecta y la factura sale como ARS.
- **Razón social:** sin etiqueta "Razón Social" puede quedar vacía; ya no hay nombres de empresas escritos en el código.

## Golden set

4 casos en `golden/*.json`, con el `rawText` real de QVAC y el `expected` del papel.
- La precisión no está publicada: todavía no hay un script que compare campo por campo, y dos de cuatro son plantilla.
- `npm test` compara cada campo de `expectedFromRawText` (CUIT, warnings, número, fecha, neto, IVA, total, moneda, tipo de cambio, total en pesos), no contra `expected`.
- arca-c y bit-excel: el CUIT impreso (`20-12345678-3` y `20-39380259-3`) no cierra módulo 11. El `expected` es `null`. El impreso queda en `cuitImpreso`, no se cuenta.

## Cómo correrlo

```bash
npm ci && cp .env.example .env   # Node >= 22.21, MONGODB_URI obligatoria
npm test && npx tsc --noEmit     # sin GPU ni Mongo; lo mismo corre en CI
npm run dev                      # http://localhost:3000, POST /api/upload (campo "factura")
```

QVAC con GPU es necesario para OCR y para el 1B; con `QVAC_ENABLED=0`, los PDF con texto se procesan solo con reglas.
