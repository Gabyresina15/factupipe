export function homePage() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FactuPipe</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; background:#090b10; color:#eceef2; margin:0; }
    main { max-width: 720px; margin: 48px auto; padding: 0 20px; }
    h1 { font-size: 22px; letter-spacing: .04em; }
    p { color:#8b939f; }
    form { margin: 24px 0; padding: 20px; background:#11151c; border:1px solid #1c232e; }
    input, button { font: inherit; }
    button { background:#2dd4bf; color:#052e2b; border:0; padding:10px 16px; cursor:pointer; font-weight:600; }
    pre { background:#11151c; padding:16px; overflow:auto; border:1px solid #1c232e; }
    a { color:#2dd4bf; }
  </style>
</head>
<body>
<main>
  <h1>FACTUPIPE</h1>
  <p>PDF nativo → pdf-parse. Foto / PDF sucio → OCR QVAC local. Campos → regex. Huecos → Llama 3.2 1B en tu GPU.</p>
  <form action="/api/upload" method="post" enctype="multipart/form-data">
    <input type="file" name="factura" accept="application/pdf,image/*" required />
    <button type="submit">Ingerir</button>
  </form>
  <p><a href="/invoices?limit=20">Listado JSON</a> · <a href="/health">Health</a></p>
</main>
</body>
</html>`;
}
