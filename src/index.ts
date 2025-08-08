import express, { Request, Response } from 'express';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import cors from 'cors';

class WhatsAppAPI {
  private db: Database | null = null;
  private app: express.Application;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private setupRoutes() {
    // Get all chats
    // @ts-ignore
    this.app.get('/chats', async (req: Request, res: Response) => {
      try {
        if (!this.db) return res.status(500).json({ error: 'Database not initialized' });

        const chats = await this.db.all(`
      SELECT 
        chat._id,
        IFNULL(jid.user, '') AS user,
        jid.raw_string AS jid,
        chat.subject,
        chat.sort_timestamp,
        message.text_data AS last_message_text
      FROM chat
      INNER JOIN jid ON chat.jid_row_id = jid._id
      LEFT JOIN message ON chat.last_message_row_id = message._id
      ORDER BY chat.sort_timestamp DESC
    `);

        res.json({
          success: true,
          data: chats,
          count: chats.length
        });
      } catch (error) {
        console.error('Error fetching chats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch chats',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get all group chats
    // @ts-ignore
    this.app.get('/group-chats', async (req: Request, res: Response) => {
      try {
        if (!this.db) return res.status(500).json({ error: 'Database not initialized' });

        const chats = await this.db.all(`
      SELECT 
        chat._id, 
        IFNULL(chat.subject, '') AS group_name,
        jid.raw_string AS jid,
        message.text_data AS last_message,
        DATETIME(ROUND(chat.sort_timestamp / 1000), 'unixepoch') AS timestamp
      FROM chat
      INNER JOIN jid ON chat.jid_row_id = jid._id
      INNER JOIN message ON chat.last_message_row_id = message._id
      WHERE jid.raw_string LIKE '%g.us'
      ORDER BY chat.sort_timestamp DESC
    `);

        res.json({
          success: true,
          data: chats,
          count: chats.length
        });
      } catch (error) {
        console.error('Error fetching group chats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch group chats',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }

    });

    // Get all group chats
    // @ts-ignore
    this.app.get('/contact-chats', async (req: Request, res: Response) => {
      try {
        if (!this.db) return res.status(500).json({ error: 'Database not initialized' });

        const chats = await this.db.all(`
      SELECT 
        chat._id, 
        IFNULL(jid.user, '') AS user,
        jid.raw_string AS jid,
        message.text_data AS last_message,
        DATETIME(ROUND(chat.sort_timestamp / 1000), 'unixepoch') AS timestamp
      FROM chat
      INNER JOIN jid ON chat.jid_row_id = jid._id
      INNER JOIN message ON chat.last_message_row_id = message._id
      WHERE jid.raw_string NOT LIKE '%g.us'
      ORDER BY chat.sort_timestamp DESC
    `);

        res.json({
          success: true,
          data: chats,
          count: chats.length
        });
      } catch (error) {
        console.error('Error fetching contact chats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch contact chats',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get messages for a specific chat
    // @ts-ignore
    this.app.get('/chat/:id', async (req: Request, res: Response) => {
      try {
        if (!this.db) return res.status(500).json({ error: 'Database not initialized' });

        const chatId = parseInt(req.params.id);
        if (isNaN(chatId)) {
          return res.status(400).json({ error: 'Invalid chat ID' });
        }

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 100;
        const offset = (page - 1) * limit;

        const messages = await this.db.all(`
      SELECT  
        m._id,
        m.key_id,
        m.from_me,
        DATETIME(ROUND(m.timestamp / 1000), 'unixepoch') AS timestamp,
        IFNULL(m.text_data, '') AS text_data,
        mm.file_path AS media_file_path,
        mq.text_data AS quoted_text,
        mq.from_me AS quoted_from_me,
        mq.key_id AS quoted_key_id
      FROM message m
      LEFT JOIN message_media mm ON m._id = mm.message_row_id
      LEFT JOIN message_quoted mq ON m._id = mq.message_row_id
      WHERE m.chat_row_id = ?
      ORDER BY m.timestamp ASC
      LIMIT ? OFFSET ?
    `, [chatId, limit, offset]);

        const totalCount = await this.db.get(`
      SELECT COUNT(*) as count FROM message WHERE chat_row_id = ?
    `, [chatId]);

        res.json({
          success: true,
          data: messages,
          pagination: {
            page,
            limit,
            total: totalCount.count,
            totalPages: Math.ceil(totalCount.count / limit)
          }
        });
      } catch (error) {
        console.error('Error fetching chat details:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch chat messages',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get call logs
    // @ts-ignore
    this.app.get('/calls', async (req: Request, res: Response) => {
      try {
        if (!this.db) return res.status(500).json({ error: 'Database not initialized' });

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = (page - 1) * limit;

        const calls = await this.db.all(`
      SELECT 
        call_log._id,
        call_log.from_me,
        call_log.timestamp,
        call_log.video_call,
        call_log.duration,
        IFNULL(jid.user, '') AS user,
        jid.raw_string AS jid
      FROM call_log
      LEFT JOIN jid ON call_log.jid_row_id = jid._id
      ORDER BY call_log.timestamp DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

        const total = await this.db.get(`SELECT COUNT(*) as count FROM call_log`);

        res.json({
          success: true,
          data: calls,
          pagination: {
            page,
            limit,
            total: total.count,
            totalPages: Math.ceil(total.count / limit)
          }
        });
      } catch (error) {
        console.error('Error fetching calls:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch calls',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        message: 'WhatsApp API is running',
        database: this.db ? 'connected' : 'disconnected'
      });
    });

    // Get database statistics
    // @ts-ignore
    this.app.get('/stats', async (req: Request, res: Response) => {
      try {
        if (!this.db) {
          return res.status(500).json({ error: 'Database not initialized' });
        }

        const chatCount = await this.db.get('SELECT COUNT(*) as count FROM chat');
        const messageCount = await this.db.get('SELECT COUNT(*) as count FROM message');
        const callCount = await this.db.get('SELECT COUNT(*) as count FROM call_log');

        res.json({
          success: true,
          data: {
            chats: chatCount.count,
            messages: messageCount.count,
            calls: callCount.count
          }
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch statistics',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  async initializeDatabase(dbPath: string): Promise<void> {
    try {
      this.db = await open({
        filename: dbPath,
        driver: sqlite3.Database,
        mode: sqlite3.OPEN_READONLY
      });

      console.log('Database connected successfully');
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw error;
    }
  }

  async start(port: number = 3000, dbPath: string): Promise<void> {
    try {
      await this.initializeDatabase(dbPath);

      this.app.listen(port, () => {
        console.log(`WhatsApp API server running on port ${port}`);
        console.log(`Database: ${dbPath}`);
        console.log('\nAvailable endpoints:');
        console.log(`  GET http://localhost:${port}/health - Health check`);
        console.log(`  GET http://localhost:${port}/stats - Database statistics`);
        console.log(`  GET http://localhost:${port}/chats - Get all chats`);
        console.log(`  GET http://localhost:${port}/group-chats - Get all group chats`);
        console.log(`  GET http://localhost:${port}/contact-chats - Get all contacts`);
        console.log(`  GET http://localhost:${port}/chat/:id - Get messages for specific chat`);
        console.log(`  GET http://localhost:${port}/calls - Get call logs`);
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      console.log('Database connection closed');
    }
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: node whatsapp-api.js <path-to-msgstore.db> [port]');
    console.log('Example: node whatsapp-api.js ./msgstore.db 3000');
    process.exit(1);
  }

  const dbPath = args[0];
  const port = parseInt(args[1]) || 3000;

  if (!require('fs').existsSync(dbPath)) {
    console.error(`Database file not found: ${dbPath}`);
    process.exit(1);
  }

  const api = new WhatsAppAPI();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await api.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down gracefully...');
    await api.close();
    process.exit(0);
  });

  api.start(port, dbPath);
}

export default WhatsAppAPI;
