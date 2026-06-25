import express from "express";
import crypto from "crypto";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { db, UserSessionRecord, initDb, pool } from "./server/db";
import { createPaymentUrl, verifyReturnUrl, VNP_RESPONSE_CODES, VnpayReturnParams } from "./server/vnpay";
import {
  sendMail,
  buildOrderConfirmEmail,
  buildAdminNewOrderEmail,
  buildVnpaySuccessEmail,
  buildVnpayFailedEmail,
  buildOrderStatusUpdateEmail,
  buildAdminContactEmail,
  buildNewReviewAdminEmail,
  buildSellerReplyEmail,
  verifyMail,
} from "./server/email";
import { Product, Order, PublicUserAccount, UserAccount, Review } from "./src/types";

dotenv.config();

const ADMIN_SESSION_TOKEN = process.env.ADMIN_SESSION_TOKEN || "HUEGIFTS-SECURE-ADMIN-SESSION-TOKEN-998877";
const USER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return { salt, hash };
}

function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actualHash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
}

function toPublicUser(user: UserAccount): PublicUserAccount {
  const { passwordHash, passwordSalt, ...rest } = user;
  return rest;
}

async function createUserSession(userId: string): Promise<UserSessionRecord> {
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + USER_SESSION_TTL_MS).toISOString();
  const token = crypto.randomBytes(32).toString("hex");
  return await db.saveSession({ token, userId, createdAt, expiresAt });
}

function getBearerToken(req: express.Request) {
  return String(req.headers["authorization"] || "").replace("Bearer ", "").trim();
}

async function getUserFromRequest(req: express.Request): Promise<UserAccount | undefined> {
  const token = getBearerToken(req);
  if (!token) return undefined;
  const session = await db.getSession(token);
  if (!session) return undefined;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await db.deleteSession(token);
    return undefined;
  }
  return await db.getUserById(session.userId);
}

function getClientIp(req: express.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket.remoteAddress || "127.0.0.1";
}

// Kiểm tra khách (theo email) đã từng mua sản phẩm này chưa (đơn không bị huỷ)
async function hasPurchasedProduct(email: string, productId: string): Promise<boolean> {
  if (!email) return false;
  const target = email.trim().toLowerCase();
  const orders = await db.getOrders();
  return orders.some(
    (o) =>
      o.status !== "cancelled" &&
      (o.email || "").trim().toLowerCase() === target &&
      Array.isArray(o.items) &&
      o.items.some((it) => it.productId === productId)
  );
}

function summarizeReviews(reviews: Review[]) {
  const published = reviews.filter((r) => r.status === "published");
  const count = published.length;
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const r of published) {
    const k = Math.min(5, Math.max(1, Math.round(r.rating)));
    distribution[k] = (distribution[k] || 0) + 1;
    sum += r.rating;
  }
  const average = count ? Math.round((sum / count) * 10) / 10 : 0;
  return { average, count, distribution };
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  // Initialize PostgreSQL schema and tables
  try {
    await initDb();
    console.log("[Huegifts] PostgreSQL database initialized successfully! 🚀");
  } catch (err) {
    console.error("[Huegifts] PostgreSQL database initialization failed:", err);
  }

  function normalizeApiKey(value: string | undefined) {
    const key = String(value || "").trim().replace(/[^\x21-\x7E]/g, "");
    if (!key) return "";
    if (/^your[-_]/i.test(key)) return "";
    if (/removed/i.test(key)) return "";
    return key;
  }

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // ─── Auth Middleware ─────────────────────────────────────────────────────
  const adminAuthMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = getBearerToken(req);
    if (token !== ADMIN_SESSION_TOKEN) {
      return res.status(403).json({ error: "Quyền truy cập bị từ chối." });
    }
    next();
  };

  const userAuthMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user) {
        return res.status(401).json({ error: "Vui lòng đăng nhập tài khoản người dùng." });
      }
      (req as express.Request & { currentUser?: UserAccount }).currentUser = user;
      next();
    } catch (err) {
      console.error("Auth middleware error:", err);
      res.status(500).json({ error: "Lỗi xác thực người dùng." });
    }
  };

  // ==================== HEALTH / DIAGNOSTIC ====================
  // Kiểm tra nhanh cấu hình deploy (chỉ trả về true/false, KHÔNG lộ giá trị bí mật).
  // Mở: https://<domain>/api/health
  app.get("/api/health", async (req, res) => {
    const hasVnpay =
      !!process.env.VNPAY_TMN_CODE &&
      !!process.env.VNPAY_HASH_SECRET &&
      process.env.VNPAY_TMN_CODE !== "DEMOVNPA" &&
      process.env.VNPAY_HASH_SECRET !== "SECRETDEMO";

    // ?verify=1 → kiểm tra THẬT: ping DB + đăng nhập SMTP (chậm hơn ~vài giây).
    // ?sendtest=<email> → GỬI THẬT 1 mail tới <email> và trả về lỗi cụ thể (nếu có).
    let live: any = undefined;
    if (req.query.verify || req.query.sendtest) {
      const [dbRes, mailRes] = await Promise.all([
        pool.query("SELECT 1").then(() => ({ ok: true })).catch((e: any) => ({ ok: false, reason: e.message })),
        verifyMail(),
      ]);
      live = { database: dbRes, smtp: mailRes, from: process.env.SMTP_USER || null };
      if (req.query.sendtest) {
        const to = String(req.query.sendtest);
        live.sendtest = { to, ...(await sendMail(to, "Huegifts — Test gửi mail", "<p>Test gửi mail thật ❀</p>")) };
      }
    }

    res.json({
      ok: true,
      appUrl: process.env.APP_URL || null,
      email: { configured: !!(process.env.SMTP_USER && process.env.SMTP_PASS), mailTo: !!process.env.MAIL_TO },
      vnpay: { configured: hasVnpay, returnUrl: `${(process.env.APP_URL || "").replace(/\/$/, "")}/api/vnpay/return` },
      ai: { configured: !!(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY) },
      database: { configured: !!process.env.DATABASE_URL },
      ...(live ? { live } : {}),
    });
  });

  // ==================== PUBLIC PRODUCT ENDPOINTS ====================

  app.get("/api/products", async (_req, res) => {
    try {
      res.json(await db.getProducts());
    } catch {
      res.status(500).json({ error: "Lỗi nạp danh sách sản phẩm." });
    }
  });

  app.get("/api/products/:slugOrId", async (req, res) => {
    try {
      const { slugOrId } = req.params;
      const product = (await db.getProductBySlug(slugOrId)) ?? (await db.getProductById(slugOrId));
      if (!product) return res.status(404).json({ error: "Không tìm thấy sản phẩm." });
      res.json(product);
    } catch {
      res.status(500).json({ error: "Lỗi nạp chi tiết sản phẩm." });
    }
  });

  // ==================== PUBLIC STORIES ENDPOINTS ====================

  app.get("/api/stories", async (_req, res) => {
    try {
      res.json(await db.getStories());
    } catch {
      res.status(500).json({ error: "Lỗi nạp danh sách câu chuyện." });
    }
  });

  app.get("/api/stories/:slugOrId", async (req, res) => {
    try {
      const { slugOrId } = req.params;
      const story = (await db.getStoryBySlug(slugOrId)) ?? (await db.getStoryById(slugOrId));
      if (!story) return res.status(404).json({ error: "Không tìm thấy câu chuyện." });
      res.json(story);
    } catch {
      res.status(500).json({ error: "Lỗi nạp chi tiết câu chuyện." });
    }
  });

  // ==================== PRODUCT REVIEWS (PUBLIC) ====================

  // Danh sách đánh giá đã đăng + tổng kết. Nếu kèm token user → báo quyền đánh giá.
  app.get("/api/products/:idOrSlug/reviews", async (req, res) => {
    try {
      const { idOrSlug } = req.params;
      const product = (await db.getProductById(idOrSlug)) ?? (await db.getProductBySlug(idOrSlug));
      if (!product) return res.status(404).json({ error: "Không tìm thấy sản phẩm." });

      const reviews = await db.getReviewsByProduct(product.id);
      const summary = summarizeReviews(reviews);

      let loggedIn = false, hasPurchased = false, myReview: Review | null = null;
      const user = await getUserFromRequest(req);
      if (user) {
        loggedIn = true;
        hasPurchased = await hasPurchasedProduct(user.email, product.id);
        myReview = (await db.getReviewByUserAndProduct(product.id, user.id)) ?? null;
      }

      res.json({ reviews, summary, auth: { loggedIn, hasPurchased, canReview: hasPurchased, myReview } });
    } catch (err) {
      console.error("Get reviews error:", err);
      res.status(500).json({ error: "Lỗi tải đánh giá." });
    }
  });

  // Gửi/sửa đánh giá — BẮT BUỘC đăng nhập + đã mua sản phẩm
  app.post("/api/products/:idOrSlug/reviews", userAuthMiddleware, async (req, res) => {
    try {
      const user = (req as express.Request & { currentUser?: UserAccount }).currentUser!;
      const { idOrSlug } = req.params;
      const product = (await db.getProductById(idOrSlug)) ?? (await db.getProductBySlug(idOrSlug));
      if (!product) return res.status(404).json({ error: "Không tìm thấy sản phẩm." });

      const rating = Math.round(Number(req.body.rating));
      const message = String(req.body.message || "").trim();
      if (!(rating >= 1 && rating <= 5)) {
        return res.status(400).json({ error: "Vui lòng chọn số sao từ 1 đến 5." });
      }

      const purchased = await hasPurchasedProduct(user.email, product.id);
      if (!purchased) {
        return res.status(403).json({ error: "Chỉ khách đã mua sản phẩm này mới có thể đánh giá ạ." });
      }

      const existing = await db.getReviewByUserAndProduct(product.id, user.id);
      const review: Review = {
        id: existing?.id || "rv-" + Date.now() + Math.random().toString(36).substring(2, 5),
        productId: product.id,
        userId: user.id,
        authorName: user.fullName || user.name || "Khách Huegifts",
        rating,
        message,
        verifiedPurchase: true,
        // Giữ nguyên trạng thái cũ khi khách sửa (không tự bỏ 'hidden' admin đã ẩn)
        status: existing?.status ?? "published",
        sellerReply: existing?.sellerReply,
        sellerReplyAt: existing?.sellerReplyAt,
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      await db.saveReview(review);

      if (!existing) {
        const adminMail = process.env.MAIL_TO || process.env.SMTP_USER;
        if (adminMail) {
          const { subject, html } = buildNewReviewAdminEmail(review, product.name);
          sendMail(adminMail, subject, html).catch(() => {});
        }
      }

      res.json({ success: true, review, updated: !!existing });
    } catch (err) {
      console.error("Post review error:", err);
      res.status(500).json({ error: "Lỗi gửi đánh giá." });
    }
  });

  // ==================== ORDER ENDPOINTS ====================

  app.post("/api/orders", async (req, res) => {
    try {
      const {
        customerName, phone, email, province, district, ward, addressDetail,
        notes, items, wrapAsGift, giftMessage, paymentMethod, shippingMethod, discountCode,
      } = req.body;

      if (!customerName || !phone || !province || !district || !ward || !addressDetail) {
        return res.status(400).json({ error: "Vui lòng nhập đầy đủ thông tin giao nhận." });
      }
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Giỏ hàng không được trống." });
      }

      const dbProducts = await db.getProducts();
      const orderItems: Order["items"] = [];
      let subtotal = 0;

      for (const cartItem of items) {
        const prod = dbProducts.find((p) => p.id === cartItem.productId);
        if (!prod) return res.status(400).json({ error: `Không nhận diện được sản phẩm ${cartItem.productId}` });
        if (prod.stock < cartItem.quantity) {
          return res.status(400).json({ error: `"${prod.name}" chỉ còn ${prod.stock} chiếc.` });
        }
        const qty = Math.max(1, parseInt(cartItem.quantity) || 1);
        subtotal += prod.price * qty;
        orderItems.push({ productId: prod.id, name: prod.name, price: prod.price, quantity: qty, image: prod.images[0] });
        prod.stock -= qty;
        await db.saveProduct(prod);
      }

      let discount = 0;
      if (discountCode?.toUpperCase() === "HUEGIFTS10") discount = Math.round(subtotal * 0.1);

      const shippingFee = shippingMethod === "express" ? 45000 : subtotal >= 500000 ? 0 : 30000;
      const total = subtotal - discount + shippingFee;

      const orderId = `HUEGIFTS${Math.floor(1000 + Math.random() * 9000)}`;
      const newOrder: Order = {
        id: orderId,
        customerName, phone, email: email || "", province, district, ward, addressDetail,
        notes: notes || "",
        items: orderItems,
        subtotal, discount, shippingFee, total,
        paymentMethod: paymentMethod || "cod",
        shippingMethod: shippingMethod || "standard",
        wrapAsGift: !!wrapAsGift,
        giftMessage: giftMessage || "",
        status: paymentMethod === "bank" || paymentMethod === "vnpay" ? "pending_payment" : "confirmed",
        createdAt: new Date().toISOString(),
      };

      await db.saveOrder(newOrder);

      // Fire-and-forget emails
      const emailTo = email || process.env.MAIL_TO;
      if (emailTo) {
        const { subject, html } = buildOrderConfirmEmail(newOrder);
        sendMail(emailTo, subject, html).catch(() => {});
      }
      const adminMail = process.env.MAIL_TO || process.env.SMTP_USER;
      if (adminMail) {
        const { subject, html } = buildAdminNewOrderEmail(newOrder);
        sendMail(adminMail, subject, html).catch(() => {});
      }

      // If VNPay: return payment URL for redirect
      if (paymentMethod === "vnpay") {
        const payUrl = createPaymentUrl({
          orderId,
          amount: total,
          orderInfo: `Thanh toan don hang ${orderId} - Huegifts`,
          ipAddr: getClientIp(req),
        });
        return res.json({ success: true, orderId, order: newOrder, vnpayUrl: payUrl });
      }

      res.json({ success: true, orderId, order: newOrder });
    } catch (err: any) {
      console.error("Order error:", err);
      res.status(500).json({ error: "Lỗi hệ thống khi tạo đơn hàng." });
    }
  });

  // ==================== VNPAY ENDPOINTS ====================

  // POST: Tạo payment URL cho đơn hàng đã tồn tại (retry thanh toán)
  app.post("/api/vnpay/create-payment", async (req, res) => {
    try {
      const { orderId } = req.body;
      const order = await db.getOrderById(orderId);
      if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng." });
      if (order.status !== "pending_payment") {
        return res.status(400).json({ error: "Đơn hàng này không ở trạng thái chờ thanh toán." });
      }

      const payUrl = createPaymentUrl({
        orderId,
        amount: order.total,
        orderInfo: `Thanh toan don hang ${orderId} - Huegifts`,
        ipAddr: getClientIp(req),
      });

      res.json({ success: true, payUrl });
    } catch (err: any) {
      res.status(500).json({ error: "Lỗi tạo link VNPay." });
    }
  });

  // GET: VNPay Return URL — khách hàng redirect về sau khi thanh toán
  app.get("/api/vnpay/return", async (req, res) => {
    try {
      const query = req.query as unknown as VnpayReturnParams;
      const { isValid, isSuccess } = verifyReturnUrl(query);

      const orderId = query.vnp_TxnRef;
      const responseCode = query.vnp_ResponseCode;
      const amount = parseInt(query.vnp_Amount || "0") / 100;
      const txnNo = query.vnp_TransactionNo || "";
      const bankCode = query.vnp_BankCode || "";
      const bankTranNo = query.vnp_BankTranNo || "";
      const cardType = query.vnp_CardType || "";
      const payDate = query.vnp_PayDate || "";

      // Lưu transaction log
      await db.saveVnpayTransaction({
        orderId,
        vnpTxnRef: orderId,
        amount,
        bankCode,
        bankTranNo,
        cardType,
        responseCode,
        transactionNo: txnNo,
        payDate,
        status: isSuccess ? "success" : "failed",
        rawResponse: JSON.stringify(query),
      });

      const order = await db.getOrderById(orderId);

      if (isSuccess && order) {
        if (order.status === "pending_payment") {
          await db.updateOrderStatus(orderId, "confirmed");
        }

        // Gửi email xác nhận VNPay thành công
        const emailTo = order.email || process.env.MAIL_TO;
        if (emailTo) {
          const updatedOrder = (await db.getOrderById(orderId)) || order;
          const { subject, html } = buildVnpaySuccessEmail(updatedOrder, txnNo, bankCode);
          sendMail(emailTo, subject, html).catch(() => {});
        }

        // Redirect frontend đến trang thành công
        const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
        return res.redirect(`${appUrl}/?page=order-success&orderId=${orderId}&vnpay=success`);
      } else {
        const reason = VNP_RESPONSE_CODES[responseCode] || "Giao dịch không thành công";

        if (order) {
          const emailTo = order.email || process.env.MAIL_TO;
          if (emailTo) {
            const { subject, html } = buildVnpayFailedEmail(order, reason);
            sendMail(emailTo, subject, html).catch(() => {});
          }
        }

        const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
        return res.redirect(
          `${appUrl}/?page=vnpay-result&orderId=${orderId}&status=failed&reason=${encodeURIComponent(reason)}`
        );
      }
    } catch (err: any) {
      console.error("VNPay return error:", err);
      res.status(500).send("Lỗi xử lý kết quả thanh toán VNPay.");
    }
  });

  // POST: VNPay IPN — server-to-server notification (bắt buộc trả RspCode 00)
  app.post("/api/vnpay/ipn", async (req, res) => {
    try {
      const query = req.body as VnpayReturnParams;
      const { isValid, isSuccess } = verifyReturnUrl(query);

      if (!isValid) {
        return res.json({ RspCode: "97", Message: "Checksum failed" });
      }

      const orderId = query.vnp_TxnRef;
      const amount = parseInt(query.vnp_Amount || "0") / 100;
      const order = await db.getOrderById(orderId);

      if (!order) return res.json({ RspCode: "01", Message: "Order not found" });
      if (Math.abs(order.total - amount) > 1) return res.json({ RspCode: "04", Message: "Invalid amount" });
      if (order.status !== "pending_payment") return res.json({ RspCode: "02", Message: "Order already confirmed" });

      if (isSuccess) {
        await db.updateOrderStatus(orderId, "confirmed");

        const emailTo = order.email || process.env.MAIL_TO;
        if (emailTo) {
          const updatedOrder = (await db.getOrderById(orderId)) || order;
          const { subject, html } = buildVnpaySuccessEmail(
            updatedOrder,
            query.vnp_TransactionNo || "",
            query.vnp_BankCode || ""
          );
          sendMail(emailTo, subject, html).catch(() => {});
        }
      }

      res.json({ RspCode: "00", Message: "Confirm Success" });
    } catch (err: any) {
      console.error("VNPay IPN error:", err);
      res.json({ RspCode: "99", Message: "Unknown error" });
    }
  });

  // GET: Kiểm tra trạng thái thanh toán của đơn hàng
  app.get("/api/orders/:id/payment-status", async (req, res) => {
    try {
      const order = await db.getOrderById(req.params.id);
      if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng." });
      const txn = await db.getVnpayTransactionByOrderId(req.params.id);
      res.json({ status: order.status, vnpay: txn ?? null });
    } catch {
      res.status(500).json({ error: "Lỗi kiểm tra thanh toán." });
    }
  });

  // Track order
  app.get("/api/orders/track", async (req, res) => {
    try {
      const { orderId, contact } = req.query;
      if (!orderId || !contact) {
        return res.status(400).json({ error: "Vui lòng cung cấp Mã đơn hàng và Số điện thoại / Email." });
      }
      const order = (await db.getOrders()).find(
        (o) =>
          o.id === orderId &&
          (o.phone.trim() === String(contact).trim() || o.email.trim() === String(contact).trim())
      );
      if (!order) return res.status(404).json({ error: "Không tìm thấy đơn hàng." });
      res.json(order);
    } catch {
      res.status(500).json({ error: "Lỗi tra cứu đơn hàng." });
    }
  });

  // Universal payment webhook (SePay, Casso, PayOS, ...)
  app.post("/api/payment-webhook", async (req, res) => {
    try {
      const bodyStr = JSON.stringify(req.body);
      let rawContent = "";
      let amount = 0;

      if (req.body.transactionContent) rawContent = req.body.transactionContent;
      if (req.body.amountIn) amount = Number(req.body.amountIn);

      if (req.body.data && Array.isArray(req.body.data)) {
        for (const log of req.body.data) {
          if (log.description) rawContent += " " + log.description;
          if (log.amount) amount = Number(log.amount);
        }
      }
      if (req.body.data && !Array.isArray(req.body.data)) {
        if (req.body.data.description) rawContent += " " + req.body.data.description;
        if (req.body.data.amount) amount = Number(req.body.data.amount);
      }
      if (!rawContent) rawContent = bodyStr;

      const match = rawContent.match(/HUEGIFTS\d+/i);
      if (!match) return res.json({ success: false, message: "Không tìm thấy mã đơn hàng." });

      const orderId = match[0].toUpperCase();
      const order = await db.getOrderById(orderId);
      if (!order) return res.json({ success: false, message: `Đơn hàng ${orderId} không tồn tại.` });
      if (order.status !== "pending_payment") return res.json({ success: true, message: "Đơn đã xác nhận trước đó." });

      await db.updateOrderStatus(orderId, "confirmed");
      const updatedOrder = (await db.getOrderById(orderId))!;

      const emailTo = updatedOrder.email || process.env.MAIL_TO;
      if (emailTo) {
        const { subject, html } = buildVnpaySuccessEmail(updatedOrder, "", "Bank Transfer");
        sendMail(emailTo, subject, html).catch(() => {});
      }

      res.json({ success: true, message: `Đơn hàng ${orderId} đã được xác nhận.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Contact form
  app.post("/api/send-contact-email", async (req, res) => {
    try {
      const { name, email, phone, subject, message } = req.body;
      if (!name || !email || !phone || !message) {
        return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin bắt buộc." });
      }

      const contact = await db.saveContact({
        name: name.trim(), email: email.trim(), phone: phone.trim(),
        subject: subject?.trim() || "Không có chủ đề", message: message.trim(),
      });

      const adminMail = process.env.MAIL_TO || process.env.SMTP_USER;
      if (adminMail) {
        const { subject: sub, html } = buildAdminContactEmail(name, email, phone, subject, message);
        sendMail(adminMail, sub, html).catch(() => {});
      }

      res.json({ message: "Đã nhận liên hệ của bạn. Chúng tôi sẽ phản hồi sớm!", contact });
    } catch (err: any) {
      res.status(500).json({ error: "Lỗi gửi liên hệ." });
    }
  });

  // ==================== SIMPLE CHAT PROXY (uses OPENAI API key from env) ====================
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history } = req.body as { message?: string; history?: Array<{ role: string; content: string }>; };
      if (!message || typeof message !== "string") return res.status(400).json({ error: "Thiếu trường 'message'." });

      // Support both OpenAI and OpenRouter providers.
      // If the configured key looks like an OpenRouter key (sk-or-*), send it to OpenRouter.
      const rawOpenaiKey = normalizeApiKey(process.env.OPENAI_API_KEY);
      const rawOpenrouterKey = normalizeApiKey(process.env.OPENROUTER_API_KEY);
      const openrouterKey = rawOpenrouterKey || (rawOpenaiKey.startsWith("sk-or-") ? rawOpenaiKey : "");
      const openaiKey = rawOpenaiKey && !rawOpenaiKey.startsWith("sk-or-") ? rawOpenaiKey : "";
      const useOpenRouter = !!openrouterKey;
      const apiKey = useOpenRouter ? openrouterKey : openaiKey;
      if (!apiKey) return res.status(500).json({ error: "AI API key not configured on server." });

      const apiUrl = useOpenRouter
        ? (process.env.OPENROUTER_URL || "https://openrouter.ai/api/v1/chat/completions")
        : "https://api.openai.com/v1/chat/completions";

      // Lấy danh mục sản phẩm thật từ DB để chatbot có thể gợi ý & dẫn link
      let catalog = "";
      try {
        const products = await db.getProducts();
        catalog = products
          .slice(0, 60)
          .map((p) => {
            const price = new Intl.NumberFormat("vi-VN").format(p.price) + "đ";
            const desc = (p.shortDescription || p.fullDescription || "").replace(/\s+/g, " ").slice(0, 90);
            return `- ${p.name} | ${p.categoryName || p.category} | ${price} | link: #/product/${p.slug}${desc ? ` | ${desc}` : ""}`;
          })
          .join("\n");
      } catch (e) {
        console.warn("[Chat] Không tải được danh mục sản phẩm:", e);
      }

      const systemPrompt = [
        "Bạn là trợ lý bán hàng thân thiện của Huegifts — cửa hàng quà tặng & đặc sản xứ Huế.",
        "Trả lời NGẮN GỌN, lịch sự, ấm áp bằng tiếng Việt. Xưng 'em', gọi khách là 'mình/anh chị'.",
        "Chỉ tư vấn dựa trên DANH MỤC SẢN PHẨM bên dưới. Khi gợi ý sản phẩm, BẮT BUỘC chèn link dạng Markdown: [Tên sản phẩm](#/product/slug) đúng theo cột 'link' để khách bấm vào xem.",
        "Nếu khách hỏi sản phẩm không có trong danh mục, hãy thành thật nói chưa có và gợi ý món tương tự đang bán.",
        "Mỗi câu trả lời nên gợi ý 1-3 sản phẩm phù hợp kèm link, không liệt kê quá dài.",
        catalog ? `\n=== DANH MỤC SẢN PHẨM HIỆN CÓ ===\n${catalog}` : "\n(Hiện chưa tải được danh mục sản phẩm.)",
      ].join("\n");

      // Build messages for Chat API
      const messages: Array<{ role: string; content: string }> = [];
      messages.push({ role: "system", content: systemPrompt });
      if (Array.isArray(history)) messages.push(...history.slice(-10));
      messages.push({ role: "user", content: message });

      const model = process.env.CHAT_MODEL || (useOpenRouter ? "openai/gpt-4o-mini" : "gpt-3.5-turbo");

      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(useOpenRouter ? { "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost:3000", "X-Title": process.env.OPENROUTER_TITLE || "Huegifts" } : {}),
        },
        body: JSON.stringify({ model, messages, max_tokens: 500 }),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        console.error(`${useOpenRouter ? "OpenRouter" : "OpenAI"} error:`, resp.status, txt);
        return res.status(502).json({ error: "Lỗi từ dịch vụ AI.", details: txt });
      }

      const data = await resp.json();
      const assistant = data?.choices?.[0]?.message?.content ?? data?.result ?? "Xin lỗi, tôi không nhận được phản hồi.";
      res.json({ reply: assistant });
    } catch (err: any) {
      console.error("Chat proxy error:", err);
      res.status(500).json({ error: "Lỗi khi gọi dịch vụ chat." });
    }
  });

  // ==================== USER AUTH ENDPOINTS ====================

  app.post("/api/auth/register", async (req, res) => {
    try {
      const {
        fullName,
        email,
        password,
        phone,
        province,
        district,
        ward,
        addressDetail,
      } = req.body;

      if (!fullName || !email || !password || !phone || !province || !district || !ward || !addressDetail) {
        return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin đăng ký." });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      if (await db.getUserByEmail(normalizedEmail)) {
        return res.status(409).json({ error: "Email này đã được sử dụng." });
      }

      const { salt, hash } = hashPassword(String(password));
      const now = new Date().toISOString();
      const user: UserAccount = {
        id: `usr-${Date.now()}`,
        name: String(fullName).trim(),
        fullName: String(fullName).trim(),
        email: normalizedEmail,
        passwordHash: hash,
        passwordSalt: salt,
        phone: String(phone).trim(),
        province: String(province).trim(),
        district: String(district).trim(),
        ward: String(ward).trim(),
        addressDetail: String(addressDetail).trim(),
        role: "user",
        status: "active",
        createdAt: now,
        updatedAt: now,
      };

      await db.saveUser(user);
      const session = await createUserSession(user.id);
      await db.touchUserLogin(user.id);

      return res.json({ success: true, user: toPublicUser(user), token: session.token });
    } catch (err: any) {
      console.error("Register error:", err);
      res.status(500).json({ error: "Lỗi đăng ký tài khoản." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Vui lòng nhập email và mật khẩu." });
      }

      const user = await db.getUserByEmail(String(email).trim().toLowerCase());
      if (!user || user.status !== "active") {
        return res.status(401).json({ error: "Tài khoản không tồn tại hoặc đã bị khóa." });
      }

      if (!verifyPassword(String(password), user.passwordSalt, user.passwordHash)) {
        return res.status(401).json({ error: "Mật khẩu không chính xác." });
      }

      const session = await createUserSession(user.id);
      await db.touchUserLogin(user.id);
      return res.json({ success: true, user: toPublicUser({ ...user, lastLoginAt: new Date().toISOString(), updatedAt: new Date().toISOString() }), token: session.token });
    } catch (err: any) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Lỗi đăng nhập tài khoản." });
    }
  });

  app.get("/api/auth/me", userAuthMiddleware, (req, res) => {
    const user = (req as express.Request & { currentUser?: UserAccount }).currentUser!;
    res.json({ success: true, user: toPublicUser(user) });
  });

  app.put("/api/auth/me", userAuthMiddleware, async (req, res) => {
    try {
      const currentUser = (req as express.Request & { currentUser?: UserAccount }).currentUser!;
      const {
        fullName,
        phone,
        province,
        district,
        ward,
        addressDetail,
        password,
        currentPassword,
      } = req.body;

      const patch: Partial<UserAccount> = {
        fullName: fullName ? String(fullName).trim() : currentUser.fullName,
        phone: phone ? String(phone).trim() : currentUser.phone,
        province: province ? String(province).trim() : currentUser.province,
        district: district ? String(district).trim() : currentUser.district,
        ward: ward ? String(ward).trim() : currentUser.ward,
        addressDetail: addressDetail ? String(addressDetail).trim() : currentUser.addressDetail,
      };

      if (password) {
        if (!currentPassword || !verifyPassword(String(currentPassword), currentUser.passwordSalt, currentUser.passwordHash)) {
          return res.status(400).json({ error: "Mật khẩu hiện tại không đúng." });
        }
        const hashed = hashPassword(String(password));
        patch.passwordHash = hashed.hash;
        patch.passwordSalt = hashed.salt;
      }

      const updated = await db.updateUser(currentUser.id, patch);
      if (!updated) return res.status(404).json({ error: "Không tìm thấy tài khoản." });
      res.json({ success: true, user: updated });
    } catch (err: any) {
      console.error("Update profile error:", err);
      res.status(500).json({ error: "Lỗi cập nhật hồ sơ." });
    }
  });

  app.post("/api/auth/logout", userAuthMiddleware, async (req, res) => {
    const token = getBearerToken(req);
    await db.deleteSession(token);
    res.json({ success: true });
  });

  // ==================== ADMIN ENDPOINTS ====================

  app.post("/api/admin/login", (req, res) => {
    try {
      const { email } = req.body;
      const adminEmail = (process.env.ADMIN_EMAIL || "nvanhue069@gmail.com").trim().toLowerCase();
      if (!email || email.trim().toLowerCase() !== adminEmail) {
        return res.status(401).json({ error: "Email không có quyền admin." });
      }
      res.json({ success: true, sessionToken: ADMIN_SESSION_TOKEN, email, role: "admin" });
    } catch {
      res.status(500).json({ error: "Lỗi đăng nhập." });
    }
  });

  app.get("/api/admin/stats", adminAuthMiddleware, async (_req, res) => {
    try {
      res.json(await db.getStats());
    } catch {
      res.status(500).json({ error: "Lỗi thống kê." });
    }
  });

  app.get("/api/admin/users", adminAuthMiddleware, async (_req, res) => {
    try {
      res.json(await db.getUsers());
    } catch {
      res.status(500).json({ error: "Lỗi tải danh sách người dùng." });
    }
  });

  app.put("/api/admin/users/:id", adminAuthMiddleware, async (req, res) => {
    try {
      const existing = await db.getUserById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Không tìm thấy người dùng." });

      const { fullName, phone, province, district, ward, addressDetail, role, status, password } = req.body;
      const patch: Partial<UserAccount> = {
        fullName: fullName ? String(fullName).trim() : existing.fullName,
        phone: phone ? String(phone).trim() : existing.phone,
        province: province ? String(province).trim() : existing.province,
        district: district ? String(district).trim() : existing.district,
        ward: ward ? String(ward).trim() : existing.ward,
        addressDetail: addressDetail ? String(addressDetail).trim() : existing.addressDetail,
        role: role === "admin" ? "admin" : "user",
        status: status === "disabled" ? "disabled" : "active",
      };

      if (password) {
        const hashed = hashPassword(String(password));
        patch.passwordHash = hashed.hash;
        patch.passwordSalt = hashed.salt;
      }

      const updated = await db.updateUser(existing.id, patch);
      if (!updated) return res.status(404).json({ error: "Không thể cập nhật người dùng." });
      res.json({ success: true, user: updated });
    } catch {
      res.status(500).json({ error: "Lỗi cập nhật người dùng." });
    }
  });

  app.put("/api/admin/users/:id/status", adminAuthMiddleware, async (req, res) => {
    try {
      const { status } = req.body;
      const updated = await db.updateUser(req.params.id, { status: status === "disabled" ? "disabled" : "active" });
      if (!updated) return res.status(404).json({ error: "Không tìm thấy người dùng." });
      res.json({ success: true, user: updated });
    } catch {
      res.status(500).json({ error: "Lỗi thay đổi trạng thái người dùng." });
    }
  });

  app.delete("/api/admin/users/:id", adminAuthMiddleware, async (req, res) => {
    try {
      const existing = await db.getUserById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Không tìm thấy người dùng." });
      if (existing.role === "admin") {
        return res.status(400).json({ error: "Không thể xóa tài khoản quản trị." });
      }
      await db.deleteSessionsByUser(existing.id);
      const ok = await db.deleteUser(existing.id);
      if (!ok) return res.status(404).json({ error: "Không thể xóa người dùng." });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Lỗi xóa người dùng." });
    }
  });

  // Stories CRUD
  app.get("/api/admin/stories", adminAuthMiddleware, async (_req, res) => {
    try {
      res.json(await db.getStories());
    } catch {
      res.status(500).json({ error: "Lỗi nạp danh sách câu chuyện." });
    }
  });

  app.post("/api/admin/stories", adminAuthMiddleware, async (req, res) => {
    try {
      const story = req.body;
      if (!story.title || !story.slug || !story.content) {
        return res.status(400).json({ error: "Thiếu thông tin câu chuyện." });
      }
      if (!story.id) story.id = "st-" + Date.now();
      await db.saveStory(story);
      res.json({ success: true, story });
    } catch {
      res.status(500).json({ error: "Lỗi tạo câu chuyện." });
    }
  });

  app.put("/api/admin/stories/:id", adminAuthMiddleware, async (req, res) => {
    try {
      const existing = await db.getStoryById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Không tìm thấy câu chuyện." });
      const updated = { ...existing, ...req.body, id: req.params.id };
      await db.saveStory(updated);
      res.json({ success: true, story: updated });
    } catch {
      res.status(500).json({ error: "Lỗi cập nhật câu chuyện." });
    }
  });

  app.delete("/api/admin/stories/:id", adminAuthMiddleware, async (req, res) => {
    try {
      const ok = await db.deleteStory(req.params.id);
      if (!ok) return res.status(404).json({ error: "Không tìm thấy câu chuyện." });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Lỗi xóa câu chuyện." });
    }
  });

  // Products CRUD
  app.get("/api/admin/products", adminAuthMiddleware, async (_req, res) => res.json(await db.getProducts()));

  app.post("/api/admin/products", adminAuthMiddleware, async (req, res) => {
    try {
      const prod: Product = req.body;
      if (!prod.name || !prod.slug || !prod.price) {
        return res.status(400).json({ error: "Thiếu thông tin sản phẩm." });
      }
      if (!prod.id) prod.id = "sp-" + Date.now();
      await db.saveProduct(prod);
      res.json({ success: true, product: prod });
    } catch {
      res.status(500).json({ error: "Lỗi tạo sản phẩm." });
    }
  });

  app.put("/api/admin/products/:id", adminAuthMiddleware, async (req, res) => {
    try {
      const existing = await db.getProductById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Không tìm thấy sản phẩm." });
      const updated = { ...existing, ...req.body, id: req.params.id };
      await db.saveProduct(updated);
      res.json({ success: true, product: updated });
    } catch {
      res.status(500).json({ error: "Lỗi cập nhật sản phẩm." });
    }
  });

  app.delete("/api/admin/products/:id", adminAuthMiddleware, async (req, res) => {
    try {
      const ok = await db.deleteProduct(req.params.id);
      if (!ok) return res.status(404).json({ error: "Không tìm thấy sản phẩm." });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Lỗi xóa sản phẩm." });
    }
  });

  // Orders
  app.get("/api/admin/orders", adminAuthMiddleware, async (_req, res) => {
    try {
      res.json(await db.getOrders());
    } catch {
      res.status(500).json({ error: "Lỗi tải đơn hàng." });
    }
  });

  app.put("/api/admin/orders/:id/status", adminAuthMiddleware, async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) return res.status(400).json({ error: "Thiếu trạng thái." });

      const oldOrder = await db.getOrderById(req.params.id);
      const updated = await db.updateOrderStatus(req.params.id, status as Order["status"]);
      if (!updated) return res.status(404).json({ error: "Không tìm thấy đơn hàng." });

      if (updated.email && oldOrder?.status !== status) {
        const { subject, html } = buildOrderStatusUpdateEmail(updated, oldOrder?.status || "");
        sendMail(updated.email, subject, html).catch(() => {});
      }

      res.json({ success: true, order: updated });
    } catch {
      res.status(500).json({ error: "Lỗi cập nhật trạng thái." });
    }
  });

  // Admin VNPay transaction for an order
  app.get("/api/admin/orders/:id/vnpay", adminAuthMiddleware, async (req, res) => {
    try {
      const txn = await db.getVnpayTransactionByOrderId(req.params.id);
      res.json({ transaction: txn ?? null });
    } catch {
      res.status(500).json({ error: "Lỗi tải thông tin VNPay." });
    }
  });

  // Contacts
  app.get("/api/admin/contacts", adminAuthMiddleware, async (_req, res) => res.json(await db.getContacts()));

  app.put("/api/admin/contacts/:id/read", adminAuthMiddleware, async (req, res) => {
    try {
      const updated = await db.toggleContactRead(req.params.id, req.body.read);
      if (!updated) return res.status(404).json({ error: "Không tìm thấy liên hệ." });
      res.json({ success: true, contact: updated });
    } catch {
      res.status(500).json({ error: "Lỗi cập nhật." });
    }
  });

  app.delete("/api/admin/contacts/:id", adminAuthMiddleware, async (req, res) => {
    try {
      const ok = await db.deleteContact(req.params.id);
      if (!ok) return res.status(404).json({ error: "Không tìm thấy liên hệ." });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Lỗi xóa." });
    }
  });

  // ── Reviews (Admin) ──────────────────────────────────────────────────────
  app.get("/api/admin/reviews", adminAuthMiddleware, async (_req, res) => {
    try {
      res.json(await db.getAllReviews());
    } catch {
      res.status(500).json({ error: "Lỗi tải đánh giá." });
    }
  });

  // Người bán phản hồi 1 đánh giá → gửi mail báo khách
  app.put("/api/admin/reviews/:id/reply", adminAuthMiddleware, async (req, res) => {
    try {
      const reply = String(req.body.reply || "").trim();
      if (!reply) return res.status(400).json({ error: "Nội dung phản hồi không được trống." });
      const review = await db.addSellerReply(req.params.id, reply);
      if (!review) return res.status(404).json({ error: "Không tìm thấy đánh giá." });

      if (review.userId) {
        const customer = await db.getUserById(review.userId);
        const product = await db.getProductById(review.productId);
        if (customer?.email && product) {
          const { subject, html } = buildSellerReplyEmail(review, product.name);
          sendMail(customer.email, subject, html).catch(() => {});
        }
      }
      res.json({ success: true, review });
    } catch {
      res.status(500).json({ error: "Lỗi gửi phản hồi." });
    }
  });

  // Ẩn / hiện đánh giá
  app.put("/api/admin/reviews/:id/status", adminAuthMiddleware, async (req, res) => {
    try {
      const status = req.body.status === "hidden" ? "hidden" : "published";
      const review = await db.setReviewStatus(req.params.id, status);
      if (!review) return res.status(404).json({ error: "Không tìm thấy đánh giá." });
      res.json({ success: true, review });
    } catch {
      res.status(500).json({ error: "Lỗi cập nhật trạng thái đánh giá." });
    }
  });

  app.delete("/api/admin/reviews/:id", adminAuthMiddleware, async (req, res) => {
    try {
      const ok = await db.deleteReview(req.params.id);
      if (!ok) return res.status(404).json({ error: "Không tìm thấy đánh giá." });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Lỗi xóa đánh giá." });
    }
  });

  // ==================== VITE DEV / STATIC PROD ====================

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: express.Request, _res: express.Response) => {
      _res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Huegifts] Server running on port ${PORT} 🌸`);
    console.log(`[Huegifts] PostgreSQL database connected successfully.`);
  });
}

startServer();
