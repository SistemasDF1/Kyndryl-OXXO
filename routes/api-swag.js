import { Router } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import pool from '../db/connection.js';

const router = Router();

// Swag catalog (configurable)
const SWAG_CATALOG = [
  { id: 'tshirt', name: 'Playera Kyndryl', description: 'Playera oficial del evento', image: '/img/swag/tshirt.png' },
  { id: 'bottle', name: 'Botella Térmica', description: 'Botella de acero inoxidable', image: '/img/swag/bottle.png' },
  { id: 'backpack', name: 'Mochila', description: 'Mochila con logo Kyndryl', image: '/img/swag/backpack.png' },
  { id: 'cap', name: 'Gorra', description: 'Gorra bordada del evento', image: '/img/swag/cap.png' }
];

function generateVoucherCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Get swag catalog
router.get('/catalog', (req, res) => {
  res.json({ success: true, catalog: SWAG_CATALOG });
});

// Redeem swag
router.post('/redeem', async (req, res) => {
  try {
    const { participantUuid, swagItem } = req.body;

    if (!participantUuid || !swagItem) {
      return res.status(400).json({ success: false, message: 'UUID y swag item requeridos' });
    }

    // Find participant
    const [participants] = await pool.query('SELECT id FROM participants WHERE uuid = ?', [participantUuid]);
    if (participants.length === 0) {
      return res.status(404).json({ success: false, message: 'Participante no encontrado' });
    }

    const participantId = participants[0].id;

    // Check all 5 stages are complete
    const [stages] = await pool.query(
      'SELECT COUNT(*) as count FROM stage_progress WHERE participant_id = ?',
      [participantId]
    );

    if (stages[0].count < 5) {
      return res.status(400).json({
        success: false,
        message: `Necesitas completar las 5 etapas. Llevas ${stages[0].count}/5`
      });
    }

    // Check if already has a voucher
    const [existingVouchers] = await pool.query(
      'SELECT voucher_code, swag_item FROM swag_vouchers WHERE participant_id = ?',
      [participantId]
    );

    if (existingVouchers.length > 0) {
      const existing = existingVouchers[0];
      const qrCode = await QRCode.toDataURL(existing.voucher_code, { width: 250, margin: 2 });
      return res.json({
        success: true,
        voucherCode: existing.voucher_code,
        swagItem: existing.swag_item,
        qrCode,
        message: 'Ya tienes un voucher generado'
      });
    }

    // Validate swag item exists
    const swagExists = SWAG_CATALOG.find(s => s.id === swagItem);
    if (!swagExists) {
      return res.status(400).json({ success: false, message: 'Swag no válido' });
    }

    // Generate voucher
    const voucherCode = generateVoucherCode();
    await pool.query(
      'INSERT INTO swag_vouchers (participant_id, voucher_code, swag_item) VALUES (?, ?, ?)',
      [participantId, voucherCode, swagExists.name]
    );

    const qrCode = await QRCode.toDataURL(voucherCode, { width: 250, margin: 2 });

    res.json({
      success: true,
      voucherCode,
      swagItem: swagExists.name,
      qrCode,
      message: 'Voucher generado exitosamente'
    });
  } catch (error) {
    console.error('Error canjeando swag:', error);
    res.status(500).json({ success: false, message: 'Error al canjear swag' });
  }
});

export default router;
