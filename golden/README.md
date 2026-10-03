# Golden set (B1)

El `expected` sale del papel, no del pipeline. Si el OCR ensucia un dígito, el test de B2 tiene que devolver `cuit: null` y `warnings: ["cuit_checksum"]`. No se valida el bug.

Casos: holded-es, bit-excel, arca-c, lider-a-usd.

Precisión se mide sobre estos 4. `rawText` es el que devolvió QVAC en las corridas reales.
