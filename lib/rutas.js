// Ruteo determinista: la categoría elegida decide el flujo de HyperFrames y
// qué puede usar de Higgsfield, para que el agente no gaste tokens explorando.

export const CATEGORIAS = [
  {
    id: 'reel',
    motor: 'auto',
    titulo: 'Reel / TikTok / Short',
    descripcion: 'Video vertical para redes con ritmo, textos y cortes.',
    formato: '9:16',
    duracion: 20,
    hyperframes: 'general-video',
    higgsfield: 'Solo si hacen falta tomas realistas que no estén en el material propio.',
  },
  {
    id: 'motion',
    motor: 'hyperframes',
    titulo: 'Motion graphic',
    descripcion: 'Pieza corta de diseño en movimiento: tipografía cinética, logo, datos, lower-third.',
    formato: '9:16',
    duracion: 8,
    hyperframes: 'motion-graphics',
    higgsfield: 'No hace falta. Todo se resuelve con código.',
  },
  {
    id: 'tomas',
    motor: 'higgsfield',
    titulo: 'Tomas de apoyo (B-roll)',
    descripcion: 'Planos realistas para acompañar un video: producto, lugares, personas, detalles.',
    formato: '9:16',
    duracion: 5,
    hyperframes: 'general-video',
    higgsfield: 'Principal. Primero imagen (generate_image), aprobada la imagen pasar a video (generate_video).',
  },
  {
    id: 'explicativo',
    motor: 'hyperframes',
    titulo: 'Video explicativo',
    descripcion: 'Explica un tema o concepto con tipografía, diagramas y datos animados.',
    formato: '9:16',
    duracion: 45,
    hyperframes: 'faceless-explainer',
    higgsfield: 'Opcional para la voz en off (TTS) si no se subió una.',
  },
  {
    id: 'promo-web',
    motor: 'hibrido',
    titulo: 'Promo de producto o web',
    descripcion: 'Lanzamiento o promoción a partir de la web de la marca y sus pantallas.',
    formato: '9:16',
    duracion: 30,
    hyperframes: 'product-launch-video',
    higgsfield: 'Opcional para planos de producto fotorrealistas.',
  },
  {
    id: 'subtitulos',
    motor: 'hyperframes',
    titulo: 'Subtítulos sobre video',
    descripcion: 'Agrega subtítulos con estilo de marca a un video propio (el video no se altera).',
    formato: 'original',
    duracion: 0,
    hyperframes: 'embedded-captions',
    higgsfield: 'No hace falta.',
  },
  {
    id: 'recut',
    motor: 'hyperframes',
    titulo: 'Gráficos sobre video a cámara',
    descripcion: 'Entrevista, podcast o video a cámara con títulos, datos y llamadas animadas.',
    formato: 'original',
    duracion: 0,
    hyperframes: 'talking-head-recut',
    higgsfield: 'Opcional: reencuadre a 9:16 (reframe) o upscale del video fuente.',
  },
  {
    id: 'musical',
    motor: 'auto',
    titulo: 'Video al ritmo de música',
    descripcion: 'Cortes, textos o slideshow sincronizados con un tema musical.',
    formato: '9:16',
    duracion: 15,
    hyperframes: 'music-to-video',
    higgsfield: 'Opcional para generar música si no se subió.',
  },
  {
    id: 'anuncio',
    motor: 'hibrido',
    titulo: 'Anuncio / UGC',
    descripcion: 'Anuncio para Meta/TikTok o video estilo creador reseñando un producto.',
    formato: '9:16',
    duracion: 20,
    hyperframes: 'general-video',
    higgsfield: 'Principal: flujos ugc-video o ads-studio. Cotizar antes de generar.',
  },
  {
    id: 'estatico',
    motor: 'auto',
    titulo: 'Pieza estática / carrusel',
    descripcion: 'Posts, portadas, carruseles o miniaturas con la identidad del proyecto.',
    formato: '4:5',
    duracion: 0,
    hyperframes: 'general-video (snapshot de fotogramas)',
    higgsfield: 'Opcional para fotografía de producto o fondos.',
  },
];

// Motor de producción: con qué recursos se hace la pieza.
export const MOTORES = {
  auto: {
    titulo: 'Automático',
    descripcion: 'Claude decide escena por escena qué conviene, comparando calidad y costo.',
    regla:
      'Decide por escena: HyperFrames cuando el código logra el resultado (gratis), Higgsfield solo cuando aporta algo que el código no puede (realismo, personas, producto, voz). Justifica cada escena con Higgsfield.',
  },
  hyperframes: {
    titulo: 'Solo HyperFrames',
    descripcion: 'Todo con código y tu material propio. Cero créditos.',
    regla: 'Usa solo HyperFrames y el material propio del proyecto. Higgsfield está deshabilitado para este pedido (0 créditos).',
  },
  higgsfield: {
    titulo: 'Solo Higgsfield',
    descripcion: 'Imágenes y video generados con IA. Ideal para tomas realistas.',
    regla:
      'Los visuales salen de Higgsfield (imagen primero, luego imagen a video). El montaje final hazlo con ffmpeg o con los flujos de Higgsfield (video-montage); no construyas composiciones de HyperFrames.',
  },
  hibrido: {
    titulo: 'Híbrido',
    descripcion: 'Tomas reales de Higgsfield con motion graphics, textos y subtítulos de HyperFrames encima.',
    regla:
      'Higgsfield genera la base visual (tomas, personas, producto) y HyperFrames pone encima la capa gráfica: títulos, motion graphics, subtítulos, transiciones y logo. El render final es con HyperFrames.',
  },
};

export const FORMATOS = ['9:16', '1:1', '4:5', '16:9', 'original'];

export const PLATAFORMAS = ['Instagram', 'TikTok', 'YouTube Shorts', 'YouTube', 'LinkedIn', 'Facebook', 'X'];

// Modos de presupuesto: qué modelo de Claude usa y cuántos créditos de Higgsfield puede gastar por pedido.
export const MODOS = {
  economico: {
    titulo: 'Económico',
    descripcion: 'Prioriza código y material propio. Modelo rápido. Casi sin créditos.',
    modelo: 'sonnet',
    topeCreditos: 10,
  },
  equilibrado: {
    titulo: 'Equilibrado',
    descripcion: 'Mejor modelo para la parte creativa. Créditos solo donde se notan.',
    modelo: 'opus',
    topeCreditos: 60,
  },
  premium: {
    titulo: 'Premium',
    descripcion: 'Máxima calidad visual. Más tomas generadas y upscale final.',
    modelo: 'opus',
    topeCreditos: 200,
  },
};

export const categoria = (id) => CATEGORIAS.find((c) => c.id === id) || CATEGORIAS[0];
