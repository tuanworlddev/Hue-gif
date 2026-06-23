import Database from "better-sqlite3";
import { Client } from "pg";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const DB_PATH = path.join(process.cwd(), "huegifts.db");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set in .env");
  process.exit(1);
}

async function runMigration() {
  console.log("Starting SQLite to PostgreSQL data migration...");
  console.log(`SQLite Path: ${DB_PATH}`);
  console.log(`PostgreSQL Endpoint: ${DATABASE_URL.split("@")[1]?.split("/")[0] || "PG Database"}`);

  // 1. Connect to SQLite
  const sqlite = new Database(DB_PATH);

  // 2. Connect to PostgreSQL
  const pgClient = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pgClient.connect();
    console.log("Connected to PostgreSQL successfully!");

    // 3. Create tables in PostgreSQL
    console.log("Creating tables in PostgreSQL if they don't exist...");
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS products (
        id          VARCHAR(255) PRIMARY KEY,
        slug        VARCHAR(255) UNIQUE NOT NULL,
        data        TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orders (
        id              VARCHAR(255) PRIMARY KEY,
        customerName    VARCHAR(255) NOT NULL,
        phone           VARCHAR(50) NOT NULL,
        email           VARCHAR(255),
        province        VARCHAR(255),
        district        VARCHAR(255),
        ward            VARCHAR(255),
        addressDetail   TEXT,
        notes           TEXT,
        subtotal        DOUBLE PRECISION DEFAULT 0,
        discount        DOUBLE PRECISION DEFAULT 0,
        shippingFee     DOUBLE PRECISION DEFAULT 0,
        total           DOUBLE PRECISION DEFAULT 0,
        paymentMethod   VARCHAR(50) DEFAULT 'cod',
        shippingMethod  VARCHAR(50) DEFAULT 'standard',
        wrapAsGift      INTEGER DEFAULT 0,
        giftMessage     TEXT,
        status          VARCHAR(50) DEFAULT 'confirmed',
        createdAt       VARCHAR(100) NOT NULL,
        data            TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id        VARCHAR(255) PRIMARY KEY,
        name      VARCHAR(255) NOT NULL,
        email     VARCHAR(255) NOT NULL,
        phone     VARCHAR(50) NOT NULL,
        subject   VARCHAR(255),
        message   TEXT NOT NULL,
        read      INTEGER DEFAULT 0,
        createdAt VARCHAR(100) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vnpay_transactions (
        id            VARCHAR(255) PRIMARY KEY,
        orderId       VARCHAR(255) NOT NULL,
        vnpTxnRef     VARCHAR(255) NOT NULL,
        amount        DOUBLE PRECISION NOT NULL,
        bankCode      VARCHAR(50),
        bankTranNo    VARCHAR(100),
        cardType      VARCHAR(50),
        responseCode  VARCHAR(50) NOT NULL,
        transactionNo VARCHAR(100),
        payDate       VARCHAR(50),
        status        VARCHAR(50) NOT NULL DEFAULT 'pending',
        rawResponse   TEXT,
        createdAt     VARCHAR(100) NOT NULL,
        FOREIGN KEY (orderId) REFERENCES orders(id)
      );

      CREATE TABLE IF NOT EXISTS users (
        id            VARCHAR(255) PRIMARY KEY,
        fullName      VARCHAR(255) NOT NULL,
        email         VARCHAR(255) UNIQUE NOT NULL,
        passwordHash  VARCHAR(255) NOT NULL,
        passwordSalt  VARCHAR(255) NOT NULL,
        phone         VARCHAR(50) NOT NULL,
        province      VARCHAR(255) NOT NULL,
        district      VARCHAR(255) NOT NULL,
        ward          VARCHAR(255) NOT NULL,
        addressDetail TEXT NOT NULL,
        role          VARCHAR(50) NOT NULL DEFAULT 'user',
        status        VARCHAR(50) NOT NULL DEFAULT 'active',
        createdAt     VARCHAR(100) NOT NULL,
        updatedAt     VARCHAR(100) NOT NULL,
        lastLoginAt   VARCHAR(100)
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        token      VARCHAR(255) PRIMARY KEY,
        userId     VARCHAR(255) NOT NULL,
        createdAt  VARCHAR(100) NOT NULL,
        expiresAt  VARCHAR(100) NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(createdAt);
      CREATE INDEX IF NOT EXISTS idx_contacts_read   ON contacts(read);
      CREATE INDEX IF NOT EXISTS idx_vnpay_order     ON vnpay_transactions(orderId);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    `);
    console.log("Tables and indexes verified/created.");

    // 4. Truncate existing data to prevent duplicate key errors during migration
    console.log("Clearing existing tables in PostgreSQL...");
    await pgClient.query("TRUNCATE TABLE user_sessions, vnpay_transactions, users, contacts, orders, products CASCADE");

    // 5. Migrate products
    const sqliteProducts = sqlite.prepare("SELECT * FROM products").all() as any[];
    console.log(`Migrating ${sqliteProducts.length} products...`);
    for (const prod of sqliteProducts) {
      await pgClient.query(
        "INSERT INTO products (id, slug, data) VALUES ($1, $2, $3)",
        [prod.id, prod.slug, prod.data]
      );
    }

    // 6. Migrate users
    const sqliteUsers = sqlite.prepare("SELECT * FROM users").all() as any[];
    console.log(`Migrating ${sqliteUsers.length} users...`);
    for (const user of sqliteUsers) {
      await pgClient.query(
        `INSERT INTO users (id, fullName, email, passwordHash, passwordSalt, phone, province, district, ward, addressDetail, role, status, createdAt, updatedAt, lastLoginAt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          user.id,
          user.fullName,
          user.email,
          user.passwordHash,
          user.passwordSalt,
          user.phone,
          user.province,
          user.district,
          user.ward,
          user.addressDetail,
          user.role,
          user.status,
          user.createdAt,
          user.updatedAt,
          user.lastLoginAt
        ]
      );
    }

    // 7. Migrate orders
    const sqliteOrders = sqlite.prepare("SELECT * FROM orders").all() as any[];
    console.log(`Migrating ${sqliteOrders.length} orders...`);
    for (const o of sqliteOrders) {
      await pgClient.query(
        `INSERT INTO orders (id, customerName, phone, email, province, district, ward, addressDetail, notes, subtotal, discount, shippingFee, total, paymentMethod, shippingMethod, wrapAsGift, giftMessage, status, createdAt, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [
          o.id,
          o.customerName,
          o.phone,
          o.email,
          o.province,
          o.district,
          o.ward,
          o.addressDetail,
          o.notes,
          o.subtotal,
          o.discount,
          o.shippingFee,
          o.total,
          o.paymentMethod,
          o.shippingMethod,
          o.wrapAsGift,
          o.giftMessage,
          o.status,
          o.createdAt,
          o.data
        ]
      );
    }

    // 8. Migrate contacts
    const sqliteContacts = sqlite.prepare("SELECT * FROM contacts").all() as any[];
    console.log(`Migrating ${sqliteContacts.length} contacts...`);
    for (const c of sqliteContacts) {
      await pgClient.query(
        `INSERT INTO contacts (id, name, email, phone, subject, message, read, createdAt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [c.id, c.name, c.email, c.phone, c.subject, c.message, c.read, c.createdAt]
      );
    }

    // 9. Migrate vnpay_transactions
    const sqliteVnpay = sqlite.prepare("SELECT * FROM vnpay_transactions").all() as any[];
    console.log(`Migrating ${sqliteVnpay.length} VNPay transactions...`);
    for (const txn of sqliteVnpay) {
      await pgClient.query(
        `INSERT INTO vnpay_transactions (id, orderId, vnpTxnRef, amount, bankCode, bankTranNo, cardType, responseCode, transactionNo, payDate, status, rawResponse, createdAt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          txn.id,
          txn.orderId,
          txn.vnpTxnRef,
          txn.amount,
          txn.bankCode,
          txn.bankTranNo,
          txn.cardType,
          txn.responseCode,
          txn.transactionNo,
          txn.payDate,
          txn.status,
          txn.rawResponse,
          txn.createdAt
        ]
      );
    }

    // 10. Migrate user_sessions
    const sqliteSessions = sqlite.prepare("SELECT * FROM user_sessions").all() as any[];
    console.log(`Migrating ${sqliteSessions.length} user sessions...`);
    for (const s of sqliteSessions) {
      await pgClient.query(
        `INSERT INTO user_sessions (token, userId, createdAt, expiresAt)
         VALUES ($1, $2, $3, $4)`,
        [s.token, s.userId, s.createdAt, s.expiresAt]
      );
    }

    console.log("\nMigration completed successfully!");
    console.log("Summary of migrated records:");
    console.log(`- Products: ${sqliteProducts.length}`);
    console.log(`- Users: ${sqliteUsers.length}`);
    console.log(`- Orders: ${sqliteOrders.length}`);
    console.log(`- Contacts: ${sqliteContacts.length}`);
    console.log(`- VNPay Transactions: ${sqliteVnpay.length}`);
    console.log(`- User Sessions: ${sqliteSessions.length}`);

  } catch (err) {
    console.error("Migration failed with error:", err);
  } finally {
    sqlite.close();
    await pgClient.end();
    console.log("Database connections closed.");
  }
}

runMigration();
