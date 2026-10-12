# Estudio de videos

Interfaz local para crear videos y piezas para redes sociales con la identidad de cada marca. Usa **Claude Code** como motor, **HyperFrames** para todo lo que se puede hacer con código (motion graphics, textos animados, logos, subtítulos, render) y **Higgsfield** solo para lo que el código no puede (tomas realistas, personas, voces).

## Cómo funciona

1. **Proyectos**: cada marca o identidad visual tiene su propio espacio.
2. **Contexto** (se llena una vez por proyecto):
   - Identidad visual: colores, tipografías, estilo, logo y manual.
   - Webs: se analizan sin gastar tokens (título, descripción, colores y fuentes).
   - Guiones, voces en off, referentes, material propio y música.
   - Requerimientos: público, plataformas, tono, qué evitar y presupuesto mensual.
3. **Pedidos**: eliges qué crear (reel, motion graphic, tomas de apoyo, explicativo, promo de web, subtítulos, gráficos sobre video, video musical, anuncio o pieza estática), completas un formulario corto y opcionalmente eliges un estilo de la galería de 800+ videos hechos con Claude.
4. **Motor de producción**: eliges con qué recursos se hace la pieza. **Automático** deja que Claude decida escena por escena; **Solo HyperFrames** usa código y tu material (cero créditos, Higgsfield bloqueado); **Solo Higgsfield** genera los visuales con IA; **Híbrido** usa tomas de Higgsfield con la capa gráfica de HyperFrames encima. Cada tipo de pieza trae un motor sugerido.
5. **Storyboard primero**: Claude propone escenas, técnica por escena, costo estimado en créditos y una comparación de cuánto costaría con cada motor. Al aprobar puedes quedarte con su propuesta o elegir otro motor. En esta fase Higgsfield solo puede consultar y cotizar; generar está bloqueado.
6. **Apruebas → producción**: se genera solo lo aprobado, sin pasar el tope de créditos. El MP4 queda en la Biblioteca del proyecto.
7. **Ajustes**: pides cambios sobre lo entregado y se reutiliza lo ya hecho.

### Ahorro de tokens y créditos
- Cada archivo nuevo se resume **una sola vez** con el modelo más económico, y los pedidos leen solo la ficha `contexto.md`.
- La categoría del pedido decide el flujo de HyperFrames, así Claude no explora.
- Modos Económico, Equilibrado y Premium definen el modelo de Claude y el tope de créditos por pedido.
- El consumo (créditos, tokens y costo) se registra por pedido y por proyecto.

## Requisitos
- [Node.js 22+](https://nodejs.org)
- FFmpeg (macOS: `brew install ffmpeg` · Windows: `winget install ffmpeg`)
- [Claude Code](https://claude.com/claude-code) con tu cuenta iniciada
- El MCP de Higgsfield agregado a Claude Code (sigue la guía de conexión de Higgsfield y comprueba con `claude mcp list`)

## Instalación
```bash
git clone <url-del-repositorio> estudio-videos
cd estudio-videos
npm install
npm run setup   # revisa requisitos e instala las skills de HyperFrames
npm start       # abre http://localhost:4173
```

Los proyectos se guardan en la carpeta `espacios/` (cámbiala con la variable `ESTUDIO_DIR`). Cada proyecto es una carpeta normal que puedes abrir, respaldar o sincronizar.

## Configuración opcional
Crea `config.local.json` en la raíz:
```json
{
  "claude": "claude",
  "permissionMode": "acceptEdits",
  "modelos": { "digerir": "haiku" },
  "herramientasExtra": []
}
```
- `herramientasExtra`: herramientas adicionales que Claude puede usar sin preguntar (por ejemplo `"Bash(python3:*)"`).

## Estructura de un proyecto
```
espacios/mi-marca/
  proyecto.json     datos de la interfaz
  contexto.md       ficha compacta que Claude lee en cada pedido
  CLAUDE.md         reglas de trabajo y ahorro
  identidad/ guiones/ voces/ referentes/ material/ musica/ webs/
  resumenes/        resúmenes únicos de cada archivo
  pedidos/<id>/     storyboard, composición, assets, registro y créditos
  salidas/<id>/     entregables finales
```

## Créditos
- [HyperFrames](https://github.com/heygen-com/hyperframes) de HeyGen (Apache 2.0).
- Galería de estilos tomada de [awesome-opus5-5-videos](https://github.com/yihui-dev/awesome-opus5-5-videos) (MIT, © 2026 yihui-dev), en `data/estilos.json`.
