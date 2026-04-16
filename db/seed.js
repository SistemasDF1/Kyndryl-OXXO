import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function seed() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  try {
    // Run schema
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    await connection.query(schema);
    console.log('Schema creado correctamente');

    // Create default admin user
    const passwordHash = await bcrypt.hash('admin123', 10);
    await connection.query(
      `INSERT IGNORE INTO kyndryl_rally.staff_users (username, password_hash, role) VALUES (?, ?, 'admin')`,
      ['admin', passwordHash]
    );
    console.log('Usuario admin creado (user: admin, pass: admin123)');

    console.log('Seed completado exitosamente');
  } catch (error) {
    console.error('Error en seed:', error.message);
  } finally {
    await connection.end();
  }
}

seed();
