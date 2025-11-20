# 🍌 Nano Banana AI - Generador de Imágenes

Webapp para generar imágenes personalizadas con IA usando **Google Gemini 2.5 Flash Image** (Nano Banana) en base a un prompt y una foto del usuario como referencia.

## ✨ Características

- 🎨 Generación de imágenes con IA usando foto de referencia del usuario
- 🚀 Interfaz moderna y fácil de usar
- 📱 Diseño responsive (móvil y desktop)
- 🖼️ Drag & drop para cargar imágenes
- 💾 Descarga de imágenes generadas
- ⚡ Respuesta rápida con Gemini 2.5 Flash Image
- 🎯 Ejemplos de prompts predefinidos

## 🛠️ Tecnologías

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js + Express
- **IA**: Google Generative AI (Gemini 2.5 Flash Image)
- **Upload**: Multer

## 📋 Prerequisitos

- Node.js (v18 o superior)
- npm o yarn
- Una API Key de Google AI Studio

## 🚀 Instalación

### 1. Clonar o descargar el proyecto

```bash
# Si usas git
git clone <tu-repo>
cd nano-banana-app

# O simplemente extrae los archivos en una carpeta
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Obtener tu API Key de Google

1. Ve a [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Inicia sesión con tu cuenta de Google
3. Haz clic en "Create API Key"
4. Copia tu API Key

### 4. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```bash
cp .env.example .env
```

Edita el archivo `.env` y agrega tu API Key:

```env
GOOGLE_API_KEY=tu_api_key_aqui
PORT=3000
```

### 5. Iniciar el servidor

```bash
npm start
```

O en modo desarrollo con auto-reload:

```bash
npm run dev
```

### 6. Abrir en el navegador

Abre tu navegador y ve a:

```
http://localhost:3000
```

## 📖 Cómo usar

1. **Sube una foto**: Arrastra una imagen o haz clic en el área de carga
2. **Escribe tu prompt**: Describe cómo quieres transformar la imagen
3. **Genera**: Haz clic en el botón "Generar Imagen"
4. **Descarga**: Una vez generada, descarga tu creación

### Ejemplos de prompts:

- "Conviérteme en un astronauta explorando Marte con traje espacial futurista"
- "Transfórmame en una pintura al óleo estilo renacentista con fondo de paisaje italiano"
- "Hazme aparecer como personaje de anime en una ciudad cyberpunk con luces de neón"
- "Colócame en la portada de una revista de moda en una pasarela con iluminación profesional"

## 💰 Costos de la API

Según la documentación oficial de Google:

- **Precio**: $30.00 por 1 millón de output tokens
- **Por imagen**: ~1290 tokens ($0.039 por imagen)
- Aproximadamente **25,641 imágenes por $1,000**

Google ofrece un tier gratuito generoso para comenzar.

## 📁 Estructura del proyecto

```
nano-banana-app/
├── public/
│   ├── index.html      # Frontend HTML
│   ├── style.css       # Estilos
│   └── app.js          # Lógica del frontend
├── uploads/            # Carpeta temporal para imágenes (se crea automáticamente)
├── server.js           # Servidor Express + API
├── package.json        # Dependencias
├── .env.example        # Plantilla de variables de entorno
├── .gitignore          # Archivos a ignorar en git
└── README.md           # Este archivo
```

## 🔧 API Endpoints

### `GET /`
Sirve la página principal

### `GET /api/health`
Verifica el estado del servidor y la API key
```json
{
  "status": "OK",
  "message": "Nano Banana API está funcionando",
  "hasApiKey": true
}
```

### `POST /api/generate`
Genera una imagen con IA

**Body (multipart/form-data)**:
- `image`: Archivo de imagen (JPG, PNG, WEBP, máx 5MB)
- `prompt`: Texto descriptivo de lo que quieres generar

**Response**:
```json
{
  "success": true,
  "image": "data:image/png;base64,...",
  "message": "Imagen generada exitosamente"
}
```

## 🐛 Solución de problemas

### Error: "No se encontró GOOGLE_API_KEY"
- Verifica que el archivo `.env` existe en la raíz del proyecto
- Asegúrate de que la API key esté correctamente configurada

### Error: "Tipo de archivo no permitido"
- Solo se aceptan imágenes JPG, PNG y WEBP
- Verifica que el archivo sea menor a 5MB

### La imagen no se genera
- Revisa la consola del navegador (F12) para ver errores
- Verifica que tu API key sea válida en Google AI Studio
- Asegúrate de tener créditos disponibles en tu cuenta de Google

### Puerto 3000 en uso
- Cambia el puerto en el archivo `.env`: `PORT=3001`
- O detén el proceso que está usando el puerto 3000

## 🚀 Despliegue en producción

### Opciones de hosting:

1. **Render** (Recomendado - Free tier disponible)
2. **Railway**
3. **Heroku**
4. **Google Cloud Run**
5. **Vercel** (requiere configuración adicional para el backend)

### Variables de entorno a configurar:
- `GOOGLE_API_KEY`
- `PORT` (usualmente automático)

## 🤝 Desarrollado por

**Development Factor**
- Marketing agency especializada en digital transformation
- Web: [developmentfactor.com](https://developmentfactor.com)

## 📄 Licencia

MIT License - Uso libre para proyectos personales y comerciales

## 🙏 Créditos

- Powered by **Google Gemini 2.5 Flash Image** (Nano Banana)
- Iconos: SVG personalizados
- Diseño: Custom por Development Factor

## 📝 Notas adicionales

- Las imágenes generadas incluyen una marca de agua SynthID invisible de Google
- Las imágenes temporales subidas se eliminan automáticamente después de procesarse
- La webapp no guarda historial de imágenes (por privacidad)

## 🔮 Próximas mejoras

- [ ] Historial de generaciones
- [ ] Múltiples estilos predefinidos
- [ ] Ajustes de aspect ratio
- [ ] Compartir en redes sociales
- [ ] Panel de administración
- [ ] Sistema de autenticación

---

¿Preguntas o problemas? Abre un issue o contáctanos.

**¡Disfruta generando imágenes increíbles con Nano Banana AI! 🍌✨**
