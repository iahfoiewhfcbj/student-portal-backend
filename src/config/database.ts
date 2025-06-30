import { createClient } from '@libsql/client';
import { logger } from './logger';

let db: ReturnType<typeof createClient> | null = null;

export const connectDatabase = async () => {
  try {
    db = createClient({
      url: process.env.DATABASE_URL || 'file:./database.db'
    });

    // Test the connection
    await db.execute('SELECT 1');
    
    logger.info('✅ Database connected successfully');
    return db;
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    throw error;
  }
};

export const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized. Call connectDatabase() first.');
  }
  return db;
};

export const disconnectDatabase = async () => {
  if (db) {
    db.close();
    db = null;
    logger.info('Database disconnected successfully');
  }
};

// Initialize database tables
export const initializeTables = async () => {
  const database = getDatabase();
  
  try {
    // Users table
    await database.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'student',
        brigadeId TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Brigades table
    await database.execute(`
      CREATE TABLE IF NOT EXISTS brigades (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        leaderId TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Events table
    await database.execute(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        date DATETIME NOT NULL,
        location TEXT,
        type TEXT NOT NULL,
        brigadeId TEXT,
        createdBy TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Event Plans table
    await database.execute(`
      CREATE TABLE IF NOT EXISTS eventPlans (
        id TEXT PRIMARY KEY,
        eventId TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        dueDate DATETIME,
        assignedTo TEXT,
        status TEXT DEFAULT 'pending',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Submissions table
    await database.execute(`
      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        eventPlanId TEXT NOT NULL,
        userId TEXT NOT NULL,
        content TEXT,
        fileUrl TEXT,
        status TEXT DEFAULT 'submitted',
        submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        gradedAt DATETIME,
        grade TEXT,
        feedback TEXT
      )
    `);

    logger.info('✅ Database tables initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize database tables:', error);
    throw error;
  }
};