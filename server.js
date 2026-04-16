import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { testConnection } from './db/connection.js';
import participantsRouter from './routes/api-participants.js';
import stagesRouter from './routes/api-stages.js';
import generateRouter from './routes/api-generate.js';
import swagRouter from './routes/api-swag.js';
import adminRouter from './routes/api-admin.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'kyndryl-rally-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));

// Static files
app.use(express.static('public'));
app.use('/downloads', express.static('downloads'));

// API Routes
app.use('/api/participants', participantsRouter);
app.use('/api/stages', stagesRouter);
app.use('/api/generate', generateRouter);
app.use('/api/swag', swagRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Kyndryl Rally API funcionando',
    hasApiKey: !!process.env.GOOGLE_API_KEY
  });
});

// Download endpoint
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'downloads', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'Archivo no encontrado' });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);

  // Test DB connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.warn('ADVERTENCIA: No se pudo conectar a MySQL. Ejecuta el seed: node db/seed.js');
  }

  if (!process.env.GOOGLE_API_KEY) {
    console.warn('ADVERTENCIA: No se encontró GOOGLE_API_KEY en .env');
  }
});
