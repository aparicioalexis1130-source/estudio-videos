# Reglas de trabajo de este proyecto

Esta carpeta es un proyecto del Estudio de videos: una marca o identidad visual con su material. Cada pedido llega con un brief; síguelo al pie de la letra.

## Dónde está cada cosa
- `contexto.md`: ficha compacta del proyecto (identidad, requerimientos, webs, lista de archivos con resúmenes). **Léela siempre primero y en lugar de los originales.**
- `proyecto.json`: datos de la interfaz. No lo edites.
- `identidad/`, `guiones/`, `voces/`, `referentes/`, `material/`, `musica/`: material subido por el usuario.
- `resumenes/`: resúmenes de una sola vez de cada archivo. Si un archivo ya tiene resumen, no lo vuelvas a analizar.
- `pedidos/<id>/`: espacio de trabajo de cada pedido (storyboard, composición, assets, registro de créditos).
- `salidas/<id>/`: entregables finales.

## Herramientas
- **HyperFrames** (`npx hyperframes ...` y sus skills, entrando por `/hyperframes`) para todo lo que se pueda hacer con código: motion graphics, tipografía, logos, gráficos, subtítulos, transiciones, montaje y render. El render es local y gratis.
- **Epidemic Sound (MCP)** para música, efectos de sonido y voces cuando el proyecto no trae los suyos: busca por mood, BPM o referencia, recorta a la duración del video y descarga solo la pista elegida.
- **Higgsfield (MCP)** solo para lo que el código no puede hacer: tomas realistas, personas, fotografía de producto, voz, upscale, reencuadre.

## Ahorro de recursos (obligatorio)
1. No explores: el brief ya dice qué flujo de HyperFrames usar.
2. No leas archivos grandes completos. Para videos usa `ffprobe` y 2-3 fotogramas con `ffmpeg`.
3. Higgsfield: imagen primero, video solo desde una imagen aprobada o que cumple el storyboard. Borradores en baja resolución. Cotiza antes de generar cuando exista la herramienta.
4. Nunca superes el tope de créditos del pedido. Registra cada gasto en `pedidos/<id>/creditos.json`.
5. Reutiliza assets de pedidos anteriores (`pedidos/*/assets/`) antes de generar nuevos.
6. Respuestas finales cortas: qué se hizo, dónde está y cuánto costó.

## Identidad
Respeta colores, tipografías, tono y la lista de "evitar" de `contexto.md`. Si el proyecto tiene `frame.md` o `design.md`, úsalo como sistema de diseño de HyperFrames; si no, créalo a partir de la ficha la primera vez y guárdalo en la raíz del proyecto para reutilizarlo.
