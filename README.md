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
- (Opcional) Epidemic Sound conectado a Claude Code para música y efectos.
- Higgsfield disponible en Claude Code: sirve el conector de Higgsfield de tu cuenta de claude.ai (aparece como `claude_ai_Higgsfield`) o el MCP agregado a mano (`Higgsfield`). Compruébalo con `claude mcp list`

## Instalación
```bash
git clone <url-del-repositorio> estudio-videos
cd estudio-videos
npm install
npm run setup   # revisa requisitos e instala las skills de HyperFrames
npm start       # abre http://localhost:4173
```

### Acceso directo en el Escritorio (macOS)
```bash
npm run acceso-directo
```
Crea **Estudio de videos.app** en el Escritorio. Con doble clic arranca el estudio (si no estaba corriendo) y abre la interfaz en el navegador.

### Música y efectos con Epidemic Sound
Si tienes cuenta de Epidemic Sound, conecta su MCP a Claude Code y el estudio lo usará para buscar, recortar y descargar música, efectos y voces cuando el proyecto no traiga los suyos. Buscar se permite en el storyboard; descargar, solo al producir. Guía oficial: https://developers.epidemicsound.com/docs/mcp/

Los proyectos se guardan en la carpeta `espacios/` (cámbiala con la variable `ESTUDIO_DIR`). Cada proyecto es una carpeta normal que puedes abrir, respaldar o sincronizar.

## Auto postproducción
Para videos que ya están cortados (con su voz en off):
1. Sube el video. La voz se transcribe en tu Mac con `npx hyperframes transcribe` (whisper.cpp o Parakeet): no gasta créditos ni tokens. La primera vez descarga el modelo. También puedes importar subtítulos `.srt` o `.vtt` de tu editor.
2. Selecciona frases en la transcripción. Aparece una barra para elegir el **tipo de contenido** (motion graphic, texto cinético, b-roll, toma de apoyo, escena literal, personaje…) y otra para el **enfoque** (publicidad, tutorial, cinematográfico…), con referencias visuales opcionales. Puedes agregar tus propios tipos y enfoques.
3. Opcional: sube una foto del rostro. Sin foto, la IA diseña un personaje y lo repite en todos los clips con persona. Los modelos que no aceptan rostro como referencia (Kling 3.0, Veo, Cinema Studio…) lo usan a través de un fotograma inicial, y la estimación lo cobra.
4. Elige el generador de video, el de imagen y el modelo de Claude. **Evaluar y generar** muestra créditos de Higgsfield (precios de `data/generadores.json`, medidos con `get_cost`) y tokens antes de empezar; el tope que apruebes no se puede pasar.
5. Antes de generar con IA se escribe una **biblia visual** del trabajo (look, paleta, luz, lente, persona) y cada clip arma su prompt con una estructura fija (sujeto, acción, lugar, cámara, luz, color, estilo, continuidad, negativos). Así los clips combinan entre sí.
6. Los tipos gráficos se hacen gratis con HyperFrames (sin acceso a Higgsfield). Los rótulos, textos y anotaciones salen como capa transparente `.mov`.
7. **Sonido (opcional):** con la casilla "Clips con sonido" cada clip lleva efectos de interfaz (whoosh, pop, clics sincronizados con la animación) o sonido ambiente y foley en las escenas; con "Incluir música de fondo" suma una base instrumental baja. Se puede cambiar en cada clip. Sale de tu carpeta `musica/` o de Epidemic Sound, nunca de Higgsfield, así que no gasta créditos. Si cambias el sonido de un clip ya hecho, "Actualizar solo el sonido" lo rehace sin volver a generar la imagen.
8. Cada clip se entrega en `salidas/<id>/` con las medidas, fps y duración exactas de su frase, sin la voz (con su sonido en volumen bajo si lo pediste), nombrado con su número y tiempo de entrada. Hay `indice.csv`, una EDL para Premiere o DaVinci y una vista previa con los clips sobre tu video.

Opciones en `config.local.json`: `"postpro": { "paralelo": 2 }` (clips a la vez) y `"transcripcion": { "modelo": "small" }` (modelo de whisper: `base`, `small`, `medium`, `large-v3`).

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
  postpro/<id>/     video original, transcripción, biblia visual, persona y trabajo de cada clip
  salidas/<id>/     entregables finales
```

## Créditos
- [HyperFrames](https://github.com/heygen-com/hyperframes) de HeyGen (Apache 2.0).
- Galería de estilos tomada de [awesome-opus5-5-videos](https://github.com/yihui-dev/awesome-opus5-5-videos) (MIT, © 2026 yihui-dev), en `data/estilos.json`.
