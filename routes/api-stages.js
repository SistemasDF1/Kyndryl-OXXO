import { Router } from 'express';
import pool from '../db/connection.js';

const router = Router();

const STAGE_NAMES = {
  1: 'Foto con IA',
  2: 'Sesión con equipo de ventas',
  3: 'Memorama',
  4: 'Asistencia a conferencia',
  5: 'Interacción con partner'
};

// Complete a stage for a participant
router.post('/complete', async (req, res) => {
  try {
    const { participantUuid, stageNumber, completedBy } = req.body;

    if (!participantUuid || !stageNumber) {
      return res.status(400).json({ success: false, message: 'UUID y número de etapa requeridos' });
    }

    const stage = parseInt(stageNumber);
    if (stage < 1 || stage > 5) {
      return res.status(400).json({ success: false, message: 'Número de etapa inválido (1-5)' });
    }

    // Find participant
    const [participants] = await pool.query('SELECT id FROM participants WHERE uuid = ?', [participantUuid]);
    if (participants.length === 0) {
      return res.status(404).json({ success: false, message: 'Participante no encontrado' });
    }

    const participantId = participants[0].id;

    // Insert stage completion (ignore if already completed)
    await pool.query(
      'INSERT IGNORE INTO stage_progress (participant_id, stage_number, completed_by) VALUES (?, ?, ?)',
      [participantId, stage, completedBy || 'self']
    );

    res.json({
      success: true,
      message: `Etapa ${stage} (${STAGE_NAMES[stage]}) completada`,
      stageName: STAGE_NAMES[stage]
    });
  } catch (error) {
    console.error('Error completando etapa:', error);
    res.status(500).json({ success: false, message: 'Error al completar etapa' });
  }
});

// Get completed stages for a participant
router.get('/:uuid', async (req, res) => {
  try {
    const [participants] = await pool.query('SELECT id FROM participants WHERE uuid = ?', [req.params.uuid]);
    if (participants.length === 0) {
      return res.status(404).json({ success: false, message: 'Participante no encontrado' });
    }

    const [stages] = await pool.query(
      'SELECT stage_number, completed_at, completed_by FROM stage_progress WHERE participant_id = ? ORDER BY stage_number',
      [participants[0].id]
    );

    res.json({ success: true, stages });
  } catch (error) {
    console.error('Error obteniendo etapas:', error);
    res.status(500).json({ success: false, message: 'Error al obtener etapas' });
  }
});

export default router;
