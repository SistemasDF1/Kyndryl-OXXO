import { Router } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db/connection.js';

const router = Router();

// Staff login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Usuario y contraseña requeridos' });
    }

    const [users] = await pool.query('SELECT * FROM staff_users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    req.session.staffUser = { id: user.id, username: user.username, role: user.role };

    res.json({ success: true, message: 'Login exitoso', user: { username: user.username, role: user.role } });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ success: false, message: 'Error en login' });
  }
});

// Staff logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: 'Sesión cerrada' });
});

// Check session
router.get('/session', (req, res) => {
  if (req.session.staffUser) {
    res.json({ success: true, user: req.session.staffUser });
  } else {
    res.status(401).json({ success: false, message: 'No autenticado' });
  }
});

// Middleware to protect admin routes
function requireStaff(req, res, next) {
  if (!req.session.staffUser) {
    return res.status(401).json({ success: false, message: 'Autenticación requerida' });
  }
  next();
}

// Scan participant QR - look up by UUID
router.post('/scan', requireStaff, async (req, res) => {
  try {
    const { uuid } = req.body;

    if (!uuid) {
      return res.status(400).json({ success: false, message: 'UUID requerido' });
    }

    const [participants] = await pool.query('SELECT * FROM participants WHERE uuid = ?', [uuid]);
    if (participants.length === 0) {
      return res.status(404).json({ success: false, message: 'Participante no encontrado' });
    }

    const participant = participants[0];
    const [stages] = await pool.query(
      'SELECT stage_number, completed_at, completed_by FROM stage_progress WHERE participant_id = ? ORDER BY stage_number',
      [participant.id]
    );

    const stageMap = {};
    for (let i = 1; i <= 5; i++) {
      const completed = stages.find(s => s.stage_number === i);
      stageMap[i] = {
        completed: !!completed,
        completedAt: completed ? completed.completed_at : null,
        completedBy: completed ? completed.completed_by : null
      };
    }

    res.json({
      success: true,
      participant: {
        uuid: participant.uuid,
        nombre: participant.nombre,
        empresa: participant.empresa,
        puesto: participant.puesto,
        telefono: participant.telefono,
        ciudad: participant.ciudad,
        createdAt: participant.created_at
      },
      stages: stageMap,
      completedCount: stages.length
    });
  } catch (error) {
    console.error('Error escaneando participante:', error);
    res.status(500).json({ success: false, message: 'Error al buscar participante' });
  }
});

// Staff marks a manual stage as complete
router.post('/complete-stage', requireStaff, async (req, res) => {
  try {
    const { participantUuid, stageNumber } = req.body;
    const stage = parseInt(stageNumber);

    // Only stages 2, 4, 5 can be completed by staff
    if (![2, 4, 5].includes(stage)) {
      return res.status(400).json({ success: false, message: 'Solo las etapas 2, 4 y 5 pueden ser completadas por staff' });
    }

    const [participants] = await pool.query('SELECT id FROM participants WHERE uuid = ?', [participantUuid]);
    if (participants.length === 0) {
      return res.status(404).json({ success: false, message: 'Participante no encontrado' });
    }

    const staffUsername = req.session.staffUser.username;
    await pool.query(
      'INSERT IGNORE INTO stage_progress (participant_id, stage_number, completed_by) VALUES (?, ?, ?)',
      [participants[0].id, stage, staffUsername]
    );

    const STAGE_NAMES = {
      2: 'Sesión con equipo de ventas',
      4: 'Asistencia a conferencia',
      5: 'Interacción con partner'
    };

    res.json({
      success: true,
      message: `Etapa ${stage} (${STAGE_NAMES[stage]}) completada por ${staffUsername}`
    });
  } catch (error) {
    console.error('Error completando etapa:', error);
    res.status(500).json({ success: false, message: 'Error al completar etapa' });
  }
});

// List all participants with progress
router.get('/participants', requireStaff, async (req, res) => {
  try {
    const [participants] = await pool.query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM stage_progress sp WHERE sp.participant_id = p.id) as completed_stages
      FROM participants p
      ORDER BY p.created_at DESC
    `);

    res.json({ success: true, participants });
  } catch (error) {
    console.error('Error listando participantes:', error);
    res.status(500).json({ success: false, message: 'Error al listar participantes' });
  }
});

// Event statistics
router.get('/stats', requireStaff, async (req, res) => {
  try {
    const [[totalParticipants]] = await pool.query('SELECT COUNT(*) as count FROM participants');

    const [stageCounts] = await pool.query(`
      SELECT stage_number, COUNT(*) as count
      FROM stage_progress
      GROUP BY stage_number
      ORDER BY stage_number
    `);

    const [[totalVouchers]] = await pool.query('SELECT COUNT(*) as count FROM swag_vouchers');
    const [[redeemedVouchers]] = await pool.query('SELECT COUNT(*) as count FROM swag_vouchers WHERE redeemed = TRUE');

    const [[completedAll]] = await pool.query(`
      SELECT COUNT(*) as count FROM (
        SELECT participant_id FROM stage_progress GROUP BY participant_id HAVING COUNT(*) = 5
      ) as completed
    `);

    res.json({
      success: true,
      stats: {
        totalParticipants: totalParticipants.count,
        completedAll: completedAll.count,
        stageCompletion: stageCounts,
        totalVouchers: totalVouchers.count,
        redeemedVouchers: redeemedVouchers.count
      }
    });
  } catch (error) {
    console.error('Error obteniendo stats:', error);
    res.status(500).json({ success: false, message: 'Error al obtener estadísticas' });
  }
});

// Verify/redeem voucher
router.post('/verify-voucher', requireStaff, async (req, res) => {
  try {
    const { voucherCode } = req.body;

    const [vouchers] = await pool.query(`
      SELECT v.*, p.nombre, p.empresa
      FROM swag_vouchers v
      JOIN participants p ON v.participant_id = p.id
      WHERE v.voucher_code = ?
    `, [voucherCode]);

    if (vouchers.length === 0) {
      return res.status(404).json({ success: false, message: 'Voucher no encontrado' });
    }

    const voucher = vouchers[0];

    if (voucher.redeemed) {
      return res.json({
        success: true,
        voucher: { ...voucher },
        message: 'Este voucher ya fue canjeado',
        alreadyRedeemed: true
      });
    }

    // Mark as redeemed
    await pool.query(
      'UPDATE swag_vouchers SET redeemed = TRUE, redeemed_at = NOW() WHERE id = ?',
      [voucher.id]
    );

    res.json({
      success: true,
      voucher: { ...voucher, redeemed: true },
      message: 'Voucher canjeado exitosamente'
    });
  } catch (error) {
    console.error('Error verificando voucher:', error);
    res.status(500).json({ success: false, message: 'Error al verificar voucher' });
  }
});

export default router;
