# Demo (A8)

Tres archivos: Holded (EUR), Factura C ARCA, Líder Gestión (USD).

Hoy el CUIT de Líder puede salir mal: el OCR escribe `300o0c0o007` y una normalización ingenua inventa dígitos. Eso no es un CUIT válido.

B2 lo corrige: módulo 11, si no cierra → `cuit: null` y `warnings: ["cuit_checksum"]`. El test vive en el golden `lider-a-usd.json` (`expectedFromRawText`).
