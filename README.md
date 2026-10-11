# Kardex

Inventario para negocios: escaneo de código de barras, reconocimiento por foto con IA, ventas, devoluciones y categorías.

- `index.html`, `app.js`, `config.js`: la app (sin paso de compilación).
- `functions/api/identify.js`: función de servidor que usa Claude para reconocer productos (necesita el secreto `ANTHROPIC_API_KEY`).
- Base de datos y usuarios: Supabase.

Publicar en Cloudflare Pages: sin comando de build, directorio de salida `/` (raíz).
