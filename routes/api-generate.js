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
  limits: { fileSize: 5 * 1024 * 1024 },
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
router.post('/', upload.single('image'), async (req, res) => {
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

    // Configure model
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-image'
    });

    const parts = [
      { text: prompt },
      {
        inlineData: {
          mimeType: req.file.mimetype,
          data: base64Image
        }
      }
    ];

    // If OXXO flow, attach shirt reference image so the model copies it accurately
    if (plecaVersion === 'oxxo') {
      const shirtPath = path.join(ROOT_DIR, 'public', 'img', 'OXXO-PRUEBA.png');
      if (fs.existsSync(shirtPath)) {
        const shirtData = fs.readFileSync(shirtPath).toString('base64');
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: shirtData
          }
        });
        console.log('Referencia de playera OXXO adjuntada');
      } else {
        console.warn('playera_oxxo.png no encontrada en public/img/');
      }
    }

    // If PROMT flow, attach background and clothing reference images from PROMT folder
    if (plecaVersion === 'promt') {
      const fondoPath = path.join(ROOT_DIR, 'public', 'img', 'PROMT', 'fondo.jpg');
      const ropaPath = path.join(ROOT_DIR, 'public', 'img', 'PROMT', 'ropa.png');

      if (fs.existsSync(fondoPath)) {
        const fondoData = fs.readFileSync(fondoPath).toString('base64');
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: fondoData
          }
        });
        console.log('Fondo PROMT adjuntado');
      } else {
        console.warn('fondo.jpg no encontrado en PROMT/');
      }

      if (fs.existsSync(ropaPath)) {
        const ropaData = fs.readFileSync(ropaPath).toString('base64');
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: ropaData
          }
        });
        console.log('Ropa PROMT adjuntada');
      } else {
        console.warn('ropa.png no encontrada en PROMT/');
      }
    }

    console.log('Generando imagen con IA...');

    const result = await model.generateContent(parts);
    const response = await result.response;

    let generatedImageBase64 = null;
    for (const part of response.candidates[0].content.parts) {
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

    // Process image with watermark
    const processedImageBase64 = await processImage(generatedImageBase64, plecaVersion || 'sin_oxxo');

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
        // Don't fail the request if DB save fails
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
