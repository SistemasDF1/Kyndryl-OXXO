import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import QRCode from 'qrcode';
import pool from '../db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const router = Router();

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(ROOT_DIR, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo JPG, PNG y WEBP'));
    }
  }
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Step 1: analyze selfie and return detailed face description
async function describePerson(base64Image, mimeType) {
  const visionModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await visionModel.generateContent([
    { text: 'Describe detalladamente los rasgos físicos de la persona en esta foto. Incluye: sexo aproximado, edad aproximada, tono de piel (muy claro/claro/moreno claro/moreno/oscuro), forma del rostro, color y estilo de cabello, color de ojos (si se ven), complexión corporal (delgado/medio/robusto), y cualquier rasgo facial distintivo (barba, bigote, lentes, etc.). Sé muy específico y detallado. Responde solo con la descripción, sin comentarios adicionales.' },
    { inlineData: { mimeType, data: base64Image } }
  ]);
  const desc = result.response.text().trim();
  console.log('Descripción de persona:', desc);
  return desc;
}

// Clean old files (keep max 30)
async function cleanOldFiles() {
  try {
    const downloadDir = path.join(ROOT_DIR, 'downloads');
    if (!fs.existsSync(downloadDir)) return;

    const files = fs.readdirSync(downloadDir)
      .filter(file => file.startsWith('figura_') && file.endsWith('.png'))
      .map(file => ({
        name: file,
        path: path.join(downloadDir, file),
        time: fs.statSync(path.join(downloadDir, file)).mtime
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 30) {
      files.slice(30).forEach(file => {
        fs.unlinkSync(file.path);
        console.log('Archivo eliminado:', file.name);
      });
    }
  } catch (error) {
    console.error('Error limpiando archivos:', error);
  }
}

// PROMT flow: remove green-screen pixels and composite person onto fondo.jpg
async function compositePersonOnFondo(generatedBase64, fondoPath) {
  if (!fs.existsSync(fondoPath)) {
    throw new Error(`fondo.jpg no encontrado: ${fondoPath}`);
  }

  const personBuffer = Buffer.from(generatedBase64, 'base64');

  // Resize AI-generated person to target canvas size and get raw RGBA pixels
  const { data, info } = await sharp(personBuffer)
    .resize(2400, 3600, { fit: 'cover', position: 'center' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  console.log(`Raw pixels: ${info.width}x${info.height} ch=${info.channels} bytes=${data.length}`);

  // Explicit copy to avoid buffer aliasing issues
  const pixels = Buffer.alloc(data.length);
  data.copy(pixels);

  // Chroma-key: remove green-dominant pixels
  let removed = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (g > 80 && g > r + 20 && g > b + 20) {
      pixels[i + 3] = 0;
      removed++;
    }
  }
  console.log(`Chroma-key: ${removed} píxeles verdes eliminados`);

  // Build transparent-background person PNG
  const personWithAlpha = await sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 }
  }).png().toBuffer();

  // Load exact fondo.jpg, resize to canvas, composite person on top
  const finalBuffer = await sharp(fondoPath)
    .resize(2400, 3600, { fit: 'cover', position: 'center' })
    .jpeg({ quality: 95 })
    .toBuffer()
    .then(fondoResized =>
      sharp(fondoResized)
        .composite([{ input: personWithAlpha, blend: 'over' }])
        .png()
        .toBuffer()
    );

  console.log(`Composite listo: ${finalBuffer.length} bytes`);
  return finalBuffer.toString('base64');
}

// Process image: resize, crop, add watermark
async function processImage(base64Image, plecaVersion = 'sin_oxxo') {
  try {
    const imageBuffer = Buffer.from(base64Image, 'base64');

    // Select watermark based on pleca version
    const watermarkFile = plecaVersion === 'con_oxxo' ? 'pleca_con_oxxo.png' : 'pleca_sin_oxxo.png';
    let watermarkPath = path.join(ROOT_DIR, 'public', 'img', watermarkFile);

    // Fallback to original watermark if new ones don't exist yet
    if (!fs.existsSync(watermarkPath)) {
      watermarkPath = path.join(ROOT_DIR, 'public', 'img', 'Kyndryl_pie.png');
    }

    const processedImage = await sharp(imageBuffer)
      .resize(2400, 3600, {
        fit: 'cover',
        position: 'center'
      })
      .png()
      .toBuffer();

    const finalImage = await sharp(processedImage)
      .composite([{
        input: watermarkPath,
        gravity: 'south'
      }])
      .png()
      .toBuffer();

    return finalImage.toString('base64');
  } catch (error) {
    console.error('Error procesando imagen:', error);
    throw error;
  }
}

// Generate image endpoint
router.post('/', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const { prompt, participantUuid, plecaVersion } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'El prompt es requerido' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'La imagen es requerida' });
    }

    // Read uploaded image
    const imagePath = req.file.path;
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');

    // For PROMT flow: analyze the selfie first to get face description
    let personDescription = '';
    if (plecaVersion === 'promt') {
      personDescription = await describePerson(base64Image, req.file.mimetype);
    }

    // Configure model
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-image'
    });

    // Build prompt with face description injected for PROMT flow
    const finalPrompt = plecaVersion === 'promt'
      ? `${prompt}\n\nDESCRIPCIÓN EXACTA DE LA PERSONA (de la selfie adjunta, úsala obligatoriamente):\n${personDescription}`
      : prompt;

    let parts;

    if (plecaVersion === 'promt') {
      // PROMT flow: selfie (IMAGE 1) + uniform (IMAGE 2)
      // The background is handled by Sharp after generation — NOT by the AI
      const ropaPath = path.join(ROOT_DIR, 'public', 'img', 'PROMT', 'ropa.png');

      parts = [
        { text: finalPrompt },
        { inlineData: { mimeType: req.file.mimetype, data: base64Image } }
      ];

      if (fs.existsSync(ropaPath)) {
        parts.push({ inlineData: { mimeType: 'image/png', data: fs.readFileSync(ropaPath).toString('base64') } });
        console.log('Uniforme OXXO adjuntado como IMAGE 2');
      } else {
        console.warn('ropa.png no encontrado en PROMT/');
      }
    } else {
      parts = [
        { text: finalPrompt },
        { inlineData: { mimeType: req.file.mimetype, data: base64Image } }
      ];

      // OXXO flow: attach shirt reference
      if (plecaVersion === 'oxxo') {
        const shirtPath = path.join(ROOT_DIR, 'public', 'img', 'OXXO-PRUEBA.png');
        if (fs.existsSync(shirtPath)) {
          parts.push({ inlineData: { mimeType: 'image/png', data: fs.readFileSync(shirtPath).toString('base64') } });
          console.log('Referencia de playera OXXO adjuntada');
        } else {
          console.warn('playera_oxxo.png no encontrada en public/img/');
        }
      }
    }

    console.log('Generando imagen con IA... partes:', parts.length, parts.map(p => p.text ? 'text' : `img(${p.inlineData?.mimeType})`));

    const result = await model.generateContent(parts);
    const response = await result.response;

    console.log('Respuesta candidatos:', response.candidates?.length);
    console.log('Partes respuesta:', response.candidates?.[0]?.content?.parts?.map(p => p.text ? 'text' : p.inlineData ? 'image' : 'otro'));

    let generatedImageBase64 = null;
    for (const part of (response.candidates?.[0]?.content?.parts || [])) {
      if (part.inlineData) {
        generatedImageBase64 = part.inlineData.data;
        break;
      }
    }

    // Clean temp file
    fs.unlinkSync(imagePath);

    if (!generatedImageBase64) {
      return res.status(500).json({
        error: 'No se pudo generar la imagen',
        details: 'La API no retornó una imagen'
      });
    }

    let processedImageBase64;

    if (plecaVersion === 'promt') {
      // PROMT flow: remove green screen and composite onto the exact fondo.jpg
      const fondoPath = path.join(ROOT_DIR, 'public', 'img', 'PROMT', 'fondo.jpg');
      generatedImageBase64 = await compositePersonOnFondo(generatedImageBase64, fondoPath);
      // Then add watermark on top of the fondo-composited image
      processedImageBase64 = await processImage(generatedImageBase64, 'promt');
    } else {
      // Other flows: standard resize + watermark
      processedImageBase64 = await processImage(generatedImageBase64, plecaVersion || 'sin_oxxo');
    }

    // Save to downloads
    const filename = `figura_${Date.now()}.png`;
    const downloadDir = path.join(ROOT_DIR, 'downloads');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
    fs.writeFileSync(path.join(downloadDir, filename), Buffer.from(processedImageBase64, 'base64'));

    await cleanOldFiles();

    const downloadUrl = `${req.protocol}://${req.get('host')}/downloads/${filename}`;
    const qrCode = await QRCode.toDataURL(downloadUrl);

    // If participant UUID provided, save to DB and complete stage 1
    if (participantUuid) {
      try {
        const [participants] = await pool.query('SELECT id FROM participants WHERE uuid = ?', [participantUuid]);
        if (participants.length > 0) {
          const participantId = participants[0].id;
          await pool.query(
            'INSERT INTO generated_images (participant_id, filename, download_url) VALUES (?, ?, ?)',
            [participantId, filename, downloadUrl]
          );
          await pool.query(
            'INSERT IGNORE INTO stage_progress (participant_id, stage_number, completed_by) VALUES (?, 1, ?)',
            [participantId, 'self']
          );
        }
      } catch (dbError) {
        console.error('Error guardando en BD:', dbError);
      }
    }

    res.json({
      success: true,
      image: `data:image/png;base64,${processedImageBase64}`,
      downloadUrl,
      qrCode,
      message: 'Imagen generada y procesada exitosamente'
    });
  } catch (error) {
    console.error('Error al generar imagen:', error);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Error al generar la imagen',
      details: error.message
    });
  }
});

export default router;
