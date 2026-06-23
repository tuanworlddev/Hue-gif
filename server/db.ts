import { Pool } from "pg";
import dotenv from "dotenv";
import { Product, Order, UserAccount, PublicUserAccount, Story, Review } from "../src/types";
import { PRODUCTS } from "../src/data/products";
import { STORIES } from "../src/data/stories";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject?: string;
  message: string;
  read: number; // 0/1 to match legacy structure
  createdAt: string;
}

export interface VnpayTransaction {
  id: string;
  orderId: string;
  vnpTxnRef: string;
  amount: number;
  bankCode?: string;
  bankTranNo?: string;
  cardType?: string;
  responseCode: string;
  transactionNo?: string;
  payDate?: string;
  status: "pending" | "success" | "failed";
  rawResponse?: string;
  createdAt: string;
}

export interface UserSessionRecord {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize database schema
export async function initDb() {
  await pool.query(`
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

    CREATE TABLE IF NOT EXISTS stories (
      id          VARCHAR(255) PRIMARY KEY,
      slug        VARCHAR(255) UNIQUE NOT NULL,
      data        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stories_slug ON stories(slug);

    CREATE TABLE IF NOT EXISTS reviews (
      id                VARCHAR(255) PRIMARY KEY,
      productId         VARCHAR(255) NOT NULL,
      userId            VARCHAR(255),
      authorName        VARCHAR(255) NOT NULL,
      rating            INTEGER NOT NULL,
      message           TEXT,
      verifiedPurchase  INTEGER DEFAULT 0,
      status            VARCHAR(50) NOT NULL DEFAULT 'published',
      sellerReply       TEXT,
      sellerReplyAt     VARCHAR(100),
      createdAt         VARCHAR(100) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(productId);
    CREATE INDEX IF NOT EXISTS idx_reviews_user    ON reviews(userId);
  `);

  const userRes = await pool.query("SELECT COUNT(*) as cnt FROM users");
  const userCount = parseInt(userRes.rows[0].cnt, 10);
  if (userCount === 0) {
    const now = new Date().toISOString();
    const salt = "seed-salt";
    const passwordHash = "seed-hash";
    await pool.query(`
      INSERT INTO users
        (id, fullName, email, passwordHash, passwordSalt, phone, province, district, ward, addressDetail, role, status, createdAt, updatedAt, lastLoginAt)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      "usr-admin",
      "Huegifts Admin",
      "nvanhue069@gmail.com",
      passwordHash,
      salt,
      "0977047908",
      "Thừa Thiên Huế",
      "Thành phố Huế",
      "Phường Vĩnh Ninh",
      "67 Phan Đình Phùng",
      "admin",
      "active",
      now,
      now,
      now
    ]);
  }

  const productRes = await pool.query("SELECT COUNT(*) as cnt FROM products");
  const productCount = parseInt(productRes.rows[0].cnt, 10);
  if (productCount === 0) {
    for (const p of PRODUCTS) {
      await pool.query(
        "INSERT INTO products (id, slug, data) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
        [p.id, p.slug, JSON.stringify(p)]
      );
    }
    console.log(`[DB] Seeded ${PRODUCTS.length} products into PostgreSQL.`);
  }

  const storyRes = await pool.query("SELECT COUNT(*) as cnt FROM stories");
  const storyCount = parseInt(storyRes.rows[0].cnt, 10);
  if (storyCount === 0) {
    for (const s of STORIES) {
      await pool.query(
        "INSERT INTO stories (id, slug, data) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
        [s.id, s.slug, JSON.stringify(s)]
      );
    }
    console.log(`[DB] Seeded ${STORIES.length} stories into PostgreSQL.`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseOrder(row: any): Order {
  const base = JSON.parse(row.data);
  return {
    ...base,
    id: row.id,
    customerName: row.customername || row.customerName,
    phone: row.phone,
    email: row.email ?? "",
    province: row.province ?? "",
    district: row.district ?? "",
    ward: row.ward ?? "",
    addressDetail: (row.addressdetail || row.addressDetail) ?? "",
    notes: row.notes ?? "",
    subtotal: row.subtotal,
    discount: row.discount,
    shippingFee: row.shippingfee || row.shippingFee,
    total: row.total,
    paymentMethod: row.paymentmethod || row.paymentMethod,
    shippingMethod: row.shippingmethod || row.shippingMethod,
    wrapAsGift: !!row.wrapasgift || !!row.wrapAsGift,
    giftMessage: (row.giftmessage || row.giftMessage) ?? "",
    status: row.status,
    createdAt: row.createdat || row.createdAt,
  };
}

function parseUser(row: any): UserAccount {
  return {
    id: row.id,
    name: row.fullname || row.fullName,
    fullName: row.fullname || row.fullName,
    email: row.email,
    passwordHash: row.passwordhash || row.passwordHash,
    passwordSalt: row.passwordsalt || row.passwordSalt,
    phone: row.phone,
    province: row.province,
    district: row.district,
    ward: row.ward,
    addressDetail: row.addressdetail || row.addressDetail,
    role: row.role,
    status: row.status,
    createdAt: row.createdat || row.createdAt,
    updatedAt: row.updatedat || row.updatedAt,
    lastLoginAt: row.lastloginat || row.lastLoginAt || undefined,
  };
}

function toPublicUser(user: UserAccount): PublicUserAccount {
  const { passwordHash, passwordSalt, ...rest } = user;
  return { ...rest, name: rest.fullName };
}

function parseReview(row: any): Review {
  return {
    id: row.id,
    productId: row.productid || row.productId,
    userId: (row.userid || row.userId) || undefined,
    authorName: row.authorname || row.authorName,
    rating: Number(row.rating),
    message: row.message ?? "",
    verifiedPurchase: !!row.verifiedpurchase || !!row.verifiedPurchase,
    status: row.status,
    sellerReply: (row.sellerreply || row.sellerReply) || undefined,
    sellerReplyAt: (row.sellerreplyat || row.sellerReplyAt) || undefined,
    createdAt: row.createdat || row.createdAt,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const db = {
  // ── Products ────────────────────────────────────────────────────────────
  async getProducts(): Promise<Product[]> {
    const res = await pool.query("SELECT data FROM products");
    return res.rows.map(r => JSON.parse(r.data) as Product);
  },

  // ── Users ─────────────────────────────────────────────────────────────
  async getUsers(): Promise<PublicUserAccount[]> {
    const res = await pool.query("SELECT * FROM users ORDER BY createdAt DESC");
    return res.rows.map((row) => toPublicUser(parseUser(row)));
  },

  async getUserById(id: string): Promise<UserAccount | undefined> {
    const res = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return res.rows[0] ? parseUser(res.rows[0]) : undefined;
  },

  async getUserByEmail(email: string): Promise<UserAccount | undefined> {
    const res = await pool.query("SELECT * FROM users WHERE lower(email) = lower($1)", [email]);
    return res.rows[0] ? parseUser(res.rows[0]) : undefined;
  },

  async saveUser(user: UserAccount): Promise<PublicUserAccount> {
    await pool.query(`
      INSERT INTO users
        (id, fullName, email, passwordHash, passwordSalt, phone, province, district, ward, addressDetail, role, status, createdAt, updatedAt, lastLoginAt)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO UPDATE SET
        fullName = EXCLUDED.fullName,
        email = EXCLUDED.email,
        passwordHash = EXCLUDED.passwordHash,
        passwordSalt = EXCLUDED.passwordSalt,
        phone = EXCLUDED.phone,
        province = EXCLUDED.province,
        district = EXCLUDED.district,
        ward = EXCLUDED.ward,
        addressDetail = EXCLUDED.addressDetail,
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        createdAt = EXCLUDED.createdAt,
        updatedAt = EXCLUDED.updatedAt,
        lastLoginAt = EXCLUDED.lastLoginAt
    `, [
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
      user.lastLoginAt ?? null
    ]);
    return toPublicUser(user);
  },

  async updateUser(id: string, patch: Partial<UserAccount>): Promise<PublicUserAccount | undefined> {
    const existing = await this.getUserById(id);
    if (!existing) return undefined;
    const updated: UserAccount = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    await this.saveUser(updated);
    return toPublicUser(updated);
  },

  async deleteUser(id: string): Promise<boolean> {
    const res = await pool.query("DELETE FROM users WHERE id = $1", [id]);
    return (res.rowCount ?? 0) > 0;
  },

  async touchUserLogin(id: string): Promise<void> {
    await pool.query("UPDATE users SET lastLoginAt = $1, updatedAt = $2 WHERE id = $3", [
      new Date().toISOString(),
      new Date().toISOString(),
      id
    ]);
  },

  async saveSession(session: UserSessionRecord): Promise<UserSessionRecord> {
    await pool.query(`
      INSERT INTO user_sessions (token, userId, createdAt, expiresAt)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (token) DO UPDATE SET
        userId = EXCLUDED.userId,
        createdAt = EXCLUDED.createdAt,
        expiresAt = EXCLUDED.expiresAt
    `, [session.token, session.userId, session.createdAt, session.expiresAt]);
    return session;
  },

  async getSession(token: string): Promise<UserSessionRecord | undefined> {
    const res = await pool.query("SELECT * FROM user_sessions WHERE token = $1", [token]);
    if (!res.rows[0]) return undefined;
    const s = res.rows[0];
    return {
      token: s.token,
      userId: s.userid || s.userId,
      createdAt: s.createdat || s.createdAt,
      expiresAt: s.expiresat || s.expiresAt,
    };
  },

  async deleteSession(token: string): Promise<boolean> {
    const res = await pool.query("DELETE FROM user_sessions WHERE token = $1", [token]);
    return (res.rowCount ?? 0) > 0;
  },

  async deleteSessionsByUser(userId: string): Promise<void> {
    await pool.query("DELETE FROM user_sessions WHERE userId = $1", [userId]);
  },

  async getProductById(id: string): Promise<Product | undefined> {
    const res = await pool.query("SELECT data FROM products WHERE id = $1", [id]);
    return res.rows[0] ? (JSON.parse(res.rows[0].data) as Product) : undefined;
  },

  async getProductBySlug(slug: string): Promise<Product | undefined> {
    const res = await pool.query("SELECT data FROM products WHERE slug = $1", [slug]);
    return res.rows[0] ? (JSON.parse(res.rows[0].data) as Product) : undefined;
  },

  async saveProduct(product: Product): Promise<Product> {
    await pool.query(`
      INSERT INTO products (id, slug, data) VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        data = EXCLUDED.data
    `, [product.id, product.slug, JSON.stringify(product)]);
    return product;
  },

  async deleteProduct(id: string): Promise<boolean> {
    const res = await pool.query("DELETE FROM products WHERE id = $1", [id]);
    return (res.rowCount ?? 0) > 0;
  },

  // ── Orders ──────────────────────────────────────────────────────────────
  async getOrders(): Promise<Order[]> {
    const res = await pool.query("SELECT * FROM orders ORDER BY createdAt DESC");
    return res.rows.map(parseOrder);
  },

  async getOrderById(id: string): Promise<Order | undefined> {
    const res = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
    return res.rows[0] ? parseOrder(res.rows[0]) : undefined;
  },

  async saveOrder(order: Order): Promise<Order> {
    await pool.query(`
      INSERT INTO orders
        (id, customerName, phone, email, province, district, ward, addressDetail,
         notes, subtotal, discount, shippingFee, total, paymentMethod,
         shippingMethod, wrapAsGift, giftMessage, status, createdAt, data)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT (id) DO UPDATE SET
        customerName = EXCLUDED.customerName,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        province = EXCLUDED.province,
        district = EXCLUDED.district,
        ward = EXCLUDED.ward,
        addressDetail = EXCLUDED.addressDetail,
        notes = EXCLUDED.notes,
        subtotal = EXCLUDED.subtotal,
        discount = EXCLUDED.discount,
        shippingFee = EXCLUDED.shippingFee,
        total = EXCLUDED.total,
        paymentMethod = EXCLUDED.paymentMethod,
        shippingMethod = EXCLUDED.shippingMethod,
        wrapAsGift = EXCLUDED.wrapAsGift,
        giftMessage = EXCLUDED.giftMessage,
        status = EXCLUDED.status,
        createdAt = EXCLUDED.createdAt,
        data = EXCLUDED.data
    `, [
      order.id,
      order.customerName,
      order.phone,
      order.email ?? "",
      order.province ?? "",
      order.district ?? "",
      order.ward ?? "",
      order.addressDetail ?? "",
      order.notes ?? "",
      order.subtotal,
      order.discount,
      order.shippingFee,
      order.total,
      order.paymentMethod,
      order.shippingMethod,
      order.wrapAsGift ? 1 : 0,
      order.giftMessage ?? "",
      order.status,
      order.createdAt,
      JSON.stringify(order)
    ]);
    return order;
  },

  async updateOrderStatus(orderId: string, status: Order["status"]): Promise<Order | undefined> {
    await pool.query("UPDATE orders SET status = $1 WHERE id = $2", [status, orderId]);
    const order = await this.getOrderById(orderId);
    if (!order) return undefined;
    // Keep the data blob in sync
    await pool.query("UPDATE orders SET data = $1 WHERE id = $2", [JSON.stringify(order), orderId]);
    return order;
  },

  // ── Contacts ────────────────────────────────────────────────────────────
  async getContacts(): Promise<ContactMessage[]> {
    const res = await pool.query("SELECT * FROM contacts ORDER BY createdAt DESC");
    return res.rows.map(c => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      subject: c.subject || undefined,
      message: c.message,
      read: c.read,
      createdAt: c.createdat || c.createdAt
    })) as ContactMessage[];
  },

  async saveContact(contact: Omit<ContactMessage, "id" | "read" | "createdAt">): Promise<ContactMessage> {
    const newContact: ContactMessage = {
      ...contact,
      id: "ct-" + Date.now() + Math.random().toString(36).substring(2, 5),
      read: 0,
      createdAt: new Date().toISOString(),
    };
    await pool.query(
      "INSERT INTO contacts (id, name, email, phone, subject, message, read, createdAt) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [
        newContact.id,
        newContact.name,
        newContact.email,
        newContact.phone,
        newContact.subject ?? "",
        newContact.message,
        0,
        newContact.createdAt
      ]
    );
    return newContact;
  },

  async toggleContactRead(contactId: string, read?: boolean): Promise<ContactMessage | undefined> {
    const res = await pool.query("SELECT * FROM contacts WHERE id = $1", [contactId]);
    const row = res.rows[0];
    if (!row) return undefined;
    const newRead = read !== undefined ? (read ? 1 : 0) : row.read ? 0 : 1;
    await pool.query("UPDATE contacts SET read = $1 WHERE id = $2", [newRead, contactId]);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      subject: row.subject || undefined,
      message: row.message,
      read: newRead,
      createdAt: row.createdat || row.createdAt
    };
  },

  async deleteContact(contactId: string): Promise<boolean> {
    const res = await pool.query("DELETE FROM contacts WHERE id = $1", [contactId]);
    return (res.rowCount ?? 0) > 0;
  },

  // ── VNPay Transactions ────────────────────────────────────────────────
  async saveVnpayTransaction(txn: Omit<VnpayTransaction, "id" | "createdAt">): Promise<VnpayTransaction> {
    const newTxn: VnpayTransaction = {
      ...txn,
      id: "vnp-" + Date.now() + Math.random().toString(36).substring(2, 5),
      createdAt: new Date().toISOString(),
    };
    await pool.query(`
      INSERT INTO vnpay_transactions
        (id, orderId, vnpTxnRef, amount, bankCode, bankTranNo, cardType,
         responseCode, transactionNo, payDate, status, rawResponse, createdAt)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      newTxn.id,
      newTxn.orderId,
      newTxn.vnpTxnRef,
      newTxn.amount,
      newTxn.bankCode ?? null,
      newTxn.bankTranNo ?? null,
      newTxn.cardType ?? null,
      newTxn.responseCode,
      newTxn.transactionNo ?? null,
      newTxn.payDate ?? null,
      newTxn.status,
      newTxn.rawResponse ?? null,
      newTxn.createdAt
    ]);
    return newTxn;
  },

  async getVnpayTransactionByOrderId(orderId: string): Promise<VnpayTransaction | undefined> {
    const res = await pool.query("SELECT * FROM vnpay_transactions WHERE orderId = $1 ORDER BY createdAt DESC LIMIT 1", [orderId]);
    if (!res.rows[0]) return undefined;
    const r = res.rows[0];
    return {
      id: r.id,
      orderId: r.orderid || r.orderId,
      vnpTxnRef: r.vnptxnref || r.vnpTxnRef,
      amount: parseFloat(r.amount),
      bankCode: r.bankcode || r.bankCode || undefined,
      bankTranNo: r.banktranno || r.bankTranNo || undefined,
      cardType: r.cardtype || r.cardType || undefined,
      responseCode: r.responsecode || r.responseCode,
      transactionNo: r.transactionno || r.transactionNo || undefined,
      payDate: r.paydate || r.payDate || undefined,
      status: r.status,
      rawResponse: r.rawresponse || r.rawResponse || undefined,
      createdAt: r.createdat || r.createdAt
    };
  },

  // ── Stats ────────────────────────────────────────────────────────────
  async getStats() {
    const totalProductsRes = await pool.query("SELECT COUNT(*) as c FROM products");
    const totalProducts = parseInt(totalProductsRes.rows[0].c, 10);

    const totalOrdersRes = await pool.query("SELECT COUNT(*) as c FROM orders");
    const totalOrders = parseInt(totalOrdersRes.rows[0].c, 10);

    const totalUsersRes = await pool.query("SELECT COUNT(*) as c FROM users");
    const totalUsers = parseInt(totalUsersRes.rows[0].c, 10);

    const pendingOrdersRes = await pool.query("SELECT COUNT(*) as c FROM orders WHERE status IN ('pending_payment','confirmed','packing')");
    const pendingOrders = parseInt(pendingOrdersRes.rows[0].c, 10);

    const unreadContactsRes = await pool.query("SELECT COUNT(*) as c FROM contacts WHERE read = 0");
    const unreadContacts = parseInt(unreadContactsRes.rows[0].c, 10);

    const revenueRes = await pool.query("SELECT COALESCE(SUM(total),0) as r FROM orders WHERE status NOT IN ('cancelled','pending_payment')");
    const revenue = parseFloat(revenueRes.rows[0].r);

    const vnpaySuccessRes = await pool.query("SELECT COUNT(*) as c FROM vnpay_transactions WHERE status = 'success'");
    const vnpaySuccess = parseInt(vnpaySuccessRes.rows[0].c, 10);

    return { totalProducts, totalOrders, totalUsers, pendingOrders, unreadContacts, revenue, vnpaySuccess };
  },

  // ── Stories ─────────────────────────────────────────────────────────────
  async getStories(): Promise<Story[]> {
    const res = await pool.query("SELECT data FROM stories");
    return res.rows.map(r => JSON.parse(r.data) as Story);
  },

  async getStoryById(id: string): Promise<Story | undefined> {
    const res = await pool.query("SELECT data FROM stories WHERE id = $1", [id]);
    return res.rows[0] ? (JSON.parse(res.rows[0].data) as Story) : undefined;
  },

  async getStoryBySlug(slug: string): Promise<Story | undefined> {
    const res = await pool.query("SELECT data FROM stories WHERE slug = $1", [slug]);
    return res.rows[0] ? (JSON.parse(res.rows[0].data) as Story) : undefined;
  },

  async saveStory(story: Story): Promise<Story> {
    await pool.query(`
      INSERT INTO stories (id, slug, data) VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        data = EXCLUDED.data
    `, [story.id, story.slug, JSON.stringify(story)]);
    return story;
  },

  async deleteStory(id: string): Promise<boolean> {
    const res = await pool.query("DELETE FROM stories WHERE id = $1", [id]);
    return (res.rowCount ?? 0) > 0;
  },

  // ── Reviews ─────────────────────────────────────────────────────────────
  async getReviewsByProduct(productId: string, includeHidden = false): Promise<Review[]> {
    const sql = includeHidden
      ? "SELECT * FROM reviews WHERE productId = $1 ORDER BY createdAt DESC"
      : "SELECT * FROM reviews WHERE productId = $1 AND status = 'published' ORDER BY createdAt DESC";
    const res = await pool.query(sql, [productId]);
    return res.rows.map(parseReview);
  },

  async getAllReviews(): Promise<Review[]> {
    const res = await pool.query("SELECT * FROM reviews ORDER BY createdAt DESC");
    return res.rows.map(parseReview);
  },

  async getReviewById(id: string): Promise<Review | undefined> {
    const res = await pool.query("SELECT * FROM reviews WHERE id = $1", [id]);
    return res.rows[0] ? parseReview(res.rows[0]) : undefined;
  },

  async getReviewByUserAndProduct(productId: string, userId: string): Promise<Review | undefined> {
    const res = await pool.query("SELECT * FROM reviews WHERE productId = $1 AND userId = $2 LIMIT 1", [productId, userId]);
    return res.rows[0] ? parseReview(res.rows[0]) : undefined;
  },

  async saveReview(review: Review): Promise<Review> {
    await pool.query(`
      INSERT INTO reviews
        (id, productId, userId, authorName, rating, message, verifiedPurchase, status, sellerReply, sellerReplyAt, createdAt)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        authorName = EXCLUDED.authorName,
        rating = EXCLUDED.rating,
        message = EXCLUDED.message,
        verifiedPurchase = EXCLUDED.verifiedPurchase,
        status = EXCLUDED.status,
        sellerReply = EXCLUDED.sellerReply,
        sellerReplyAt = EXCLUDED.sellerReplyAt
    `, [
      review.id,
      review.productId,
      review.userId ?? null,
      review.authorName,
      review.rating,
      review.message ?? "",
      review.verifiedPurchase ? 1 : 0,
      review.status,
      review.sellerReply ?? null,
      review.sellerReplyAt ?? null,
      review.createdAt,
    ]);
    await this.recomputeProductRating(review.productId);
    return review;
  },

  async setReviewStatus(id: string, status: Review["status"]): Promise<Review | undefined> {
    await pool.query("UPDATE reviews SET status = $1 WHERE id = $2", [status, id]);
    const r = await this.getReviewById(id);
    if (r) await this.recomputeProductRating(r.productId);
    return r;
  },

  async addSellerReply(id: string, reply: string): Promise<Review | undefined> {
    await pool.query(
      "UPDATE reviews SET sellerReply = $1, sellerReplyAt = $2 WHERE id = $3",
      [reply, new Date().toISOString(), id]
    );
    return this.getReviewById(id);
  },

  async deleteReview(id: string): Promise<boolean> {
    const existing = await this.getReviewById(id);
    const res = await pool.query("DELETE FROM reviews WHERE id = $1", [id]);
    if (existing) await this.recomputeProductRating(existing.productId);
    return (res.rowCount ?? 0) > 0;
  },

  // Tính lại điểm trung bình + số lượng đánh giá thật cho sản phẩm
  async recomputeProductRating(productId: string): Promise<void> {
    const res = await pool.query(
      "SELECT rating FROM reviews WHERE productId = $1 AND status = 'published'",
      [productId]
    );
    const ratings = res.rows.map((r) => Number(r.rating));
    const product = await this.getProductById(productId);
    if (!product) return;
    if (ratings.length === 0) {
      product.rating = 0;
      product.reviewCount = 0;
    } else {
      const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      product.rating = Math.round(avg * 10) / 10;
      product.reviewCount = ratings.length;
    }
    await this.saveProduct(product);
  },
};
