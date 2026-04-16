import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kyndryl_rally',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('MySQL conectado correctamente');
    conn.release();
    return true;
  } catch (error) {
    console.error('Error conectando a MySQL:', error.message);
    return false;
  }
}

export default pool;
