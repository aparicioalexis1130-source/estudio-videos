// Ruteo determinista: la categoría elegida decide el flujo de HyperFrames y
// qué puede usar de Higgsfield, para que el agente no gaste tokens explorando.

export const CATEGORIAS = [
  {
    id: 'reel',
    titulo: 'Reel / TikTok / Short',
    descripcion: 'Video vertical para redes con ritmo, textos y cortes.',
    formato: '9:16',
    duracion: 20,
    hyperframes: 'general-video',
    higgsfield: 'Solo si hacen falta tomas realistas que no estén en el material propio.',
  },
  {
    id: 'motion',
    titulo: 'Motion graphic',
    descripcion: 'Pieza corta de diseño en movimiento: tipografía cinética, logo, datos, lower-third.',
    formato: '9:16',
    duracion: 8,
    hyperframes: 'motion-graphics',
    higgsfield: 'No hace falta. Todo se resuelve con código.',
  },
  {
    id: 'tomas',
    titulo: 'Tomas de apoyo (B-roll)',
    descripcion: 'Planos realistas para acompañar un video: producto, lugares, personas, detalles.',
    formato: '9:16',
    duracion: 5,
    hyperframes: 'general-video',
    higgsfield: 'Principal. Primero imagen (generate_image), aprobada la imagen pasar a video (generate_video).',
  },
  {
    id: 'explicativo',
    titulo: 'Video explicativo',
    descripcion: 'Explica un tema o concepto con tipografía, diagramas y datos animados.',
    formato: '9:16',
    duracion: 45,
    hyperframes: 'faceless-explainer',
    higgsfield: 'Opcional para la voz en off (TTS) si no se subió una.',
  },
  {
    id: 'promo-web',
    titulo: 'Promo de producto o web',
    descripcion: 'Lanzamiento o promoción a partir de la web de la marca y sus pantallas.',
    formato: '9:16',
    duracion: 30,
    hyperframes: 'product-launch-video',
    higgsfield: 'Opcional para planos de producto fotorrealistas.',
  },
  {
    id: 'subtitulos',
    titulo: 'Subtítulos sobre video',
    descripcion: 'Agrega subtítulos con estilo de marca a un video propio (el video no se altera).',
    formato: 'original',
    duracion: 0,
    hyperframes: 'embedded-captions',
    higgsfield: 'No hace falta.',
  },
  {
    id: 'recut',
    titulo: 'Gráficos sobre video a cámara',
    descripcion: 'Entrevista, podcast o video a cámara con títulos, datos y llamadas animadas.',
    formato: 'original',
    duracion: 0,
    hyperframes: 'talking-head-recut',
    higgsfield: 'Opcional: reencuadre a 9:16 (reframe) o upscale del video fuente.',
  },
  {
    id: 'musical',
    titulo: 'Video al ritmo de música',
    descripcion: 'Cortes, textos o slideshow sincronizados con un tema musical.',
    formato: '9:16',
    duracion: 15,
    hyperframes: 'music-to-video',
    higgsfield: 'Opcional para generar música si no se subió.',
  },
  {
    id: 'anuncio',
    titulo: 'Anuncio / UGC',
    descripcion: 'Anuncio para Meta/TikTok o video estilo creador reseñando un producto.',
    formato: '9:16',
    duracion: 20,
    hyperframes: 'general-video',
    higgsfield: 'Principal: flujos ugc-video o ads-studio. Cotizar antes de generar.',
  },
  {
    id: 'estatico',
    titulo: 'Pieza estática / carrusel',
    descripcion: 'Posts, portadas, carruseles o miniaturas con la identidad del proyecto.',
    formato: '4:5',
    duracion: 0,
    hyperframes: 'general-video (snapshot de fotogramas)',
    higgsfield: 'Opcional para fotografía de producto o fondos.',
  },
];

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
