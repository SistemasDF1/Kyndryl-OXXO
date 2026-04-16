import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import pool from '../db/connection.js';

const router = Router();

// Register new participant
router.post('/register', async (req, res) => {
  try {
    const { nombre, empresa, puesto, telefono, ciudad } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ success: false, message: 'El nombre es requerido' });
    }

    const participantUuid = uuidv4();

    await pool.query(
      'INSERT INTO participants (uuid, nombre, empresa, puesto, telefono, ciudad) VALUES (?, ?, ?, ?, ?, ?)',
      [participantUuid, nombre.trim(), empresa || '', puesto || '', telefono || '', ciudad || '']
    );

    // Generate QR code with participant URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const passportUrl = `${baseUrl}/passport.html?id=${participantUuid}`;
    const qrCodeDataUrl = await QRCode.toDataURL(passportUrl, { width: 300, margin: 2 });

    res.json({
      success: true,
      uuid: participantUuid,
      qrCode: qrCodeDataUrl,
      passportUrl,
      message: 'Registro exitoso'
    });
  } catch (error) {
    console.error('Error registrando participante:', error);
    res.status(500).json({ success: false, message: 'Error al registrar participante' });
  }
});

// Get participant data
router.get('/:uuid', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM participants WHERE uuid = ?', [req.params.uuid]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Participante no encontrado' });
    }

    res.json({ success: true, participant: rows[0] });
  } catch (error) {
    console.error('Error obteniendo participante:', error);
    res.status(500).json({ success: false, message: 'Error al obtener datos' });
  }
});

// Get full passport state (participant data + stage progress)
router.get('/:uuid/passport', async (req, res) => {
  try {
    const [participants] = await pool.query('SELECT * FROM participants WHERE uuid = ?', [req.params.uuid]);

    if (participants.length === 0) {
      return res.status(404).json({ success: false, message: 'Participante no encontrado' });
    }

    const participant = participants[0];

    const [stages] = await pool.query(
      'SELECT stage_number, completed_at, completed_by FROM stage_progress WHERE participant_id = ? ORDER BY stage_number',
      [participant.id]
    );

    const [vouchers] = await pool.query(
      'SELECT voucher_code, swag_item, redeemed, created_at FROM swag_vouchers WHERE participant_id = ?',
      [participant.id]
    );

    // Build stage map (1-5)
    const stageMap = {};
    for (let i = 1; i <= 5; i++) {
      const completed = stages.find(s => s.stage_number === i);
      stageMap[i] = {
        completed: !!completed,
        completedAt: completed ? completed.completed_at : null,
        completedBy: completed ? completed.completed_by : null
      };
    }

    const completedCount = stages.length;

    // Generate QR code
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const passportUrl = `${baseUrl}/passport.html?id=${participant.uuid}`;
    const qrCode = await QRCode.toDataURL(passportUrl, { width: 300, margin: 2 });

    res.json({
      success: true,
      participant: {
        uuid: participant.uuid,
        nombre: participant.nombre,
        empresa: participant.empresa,
        puesto: participant.puesto,
        ciudad: participant.ciudad
      },
      stages: stageMap,
      completedCount,
      totalStages: 5,
      canRedeemSwag: completedCount >= 5,
      vouchers,
      qrCode
    });
  } catch (error) {
    console.error('Error obteniendo pasaporte:', error);
    res.status(500).json({ success: false, message: 'Error al obtener pasaporte' });
  }
});

export default router;
