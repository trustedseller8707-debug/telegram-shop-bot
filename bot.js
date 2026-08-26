import TelegramBot from "node-telegram-bot-api";
import { createClient } from "@supabase/supabase-js";

/*
========================================================
TELEGRAM SHOP BOT
Node.js + Telegram + Supabase
========================================================

REQUIRED ENV VARIABLES:

BOT_TOKEN
SUPABASE_URL
SUPABASE_SECRET_KEY
ADMIN_EMAIL

========================================================
*/

const BOT_TOKEN = String(process.env.BOT_TOKEN || "").trim();

const SUPABASE_URL = String(
  process.env.SUPABASE_URL || ""
).trim();

const SUPABASE_KEY = String(
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ""
).trim();

const ADMIN_EMAIL = String(
  process.env.ADMIN_EMAIL || ""
).trim().toLowerCase();


/*
========================================================
ENV CHECK
========================================================
*/

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is missing");
}

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is missing");
}

if (!SUPABASE_KEY) {
  throw new Error("SUPABASE_SECRET_KEY is missing");
}

if (!ADMIN_EMAIL) {
  throw new Error("ADMIN_EMAIL is missing");
}


/*
========================================================
CLIENTS
========================================================
*/

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


/*
========================================================
SESSIONS
========================================================
*/

const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      mode: null,
      product: {},
      adminVerified: false
    });
  }

  return sessions.get(userId);
}

function clearSession(userId) {
  sessions.delete(userId);
}


/*
========================================================
HELPERS
========================================================
*/

function money(value) {
  const number = Number(value || 0);

  return `₹${number.toFixed(2)}`;
}

function safeText(value) {
  return String(value ?? "")
    .replace(/[<>]/g, "");
}

function mainMenu(isAdmin = false) {

  const keyboard = [
    [
      {
        text: "🛍 Products",
        callback_data: "products"
      }
    ],
    [
      {
        text: "👤 My Account",
        callback_data: "account"
      }
    ],
    [
      {
        text: "📦 My Orders",
        callback_data: "orders"
      }
    ],
    [
      {
        text: "ℹ️ Help",
        callback_data: "help"
      }
    ]
  ];

  if (isAdmin) {
    keyboard.push([
      {
        text: "⚙️ Admin Panel",
        callback_data: "admin"
      }
    ]);
  }

  return {
    reply_markup: {
      inline_keyboard: keyboard
    }
  };
}


function adminMenu() {

  return {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "➕ Add Product",
            callback_data: "admin_add_product"
          }
        ],
        [
          {
            text: "📦 Products",
            callback_data: "admin_products"
          }
        ],
        [
          {
            text: "👥 Customers",
            callback_data: "admin_customers"
          }
        ],
        [
          {
            text: "🧾 Orders",
            callback_data: "admin_orders"
          }
        ],
        [
          {
            text: "📊 Dashboard",
            callback_data: "admin_dashboard"
          }
        ],
        [
          {
            text: "🏠 Main Menu",
            callback_data: "home"
          }
        ]
      ]
    }
  };
}


/*
========================================================
DATABASE HELPERS
========================================================
*/

async function getUser(telegramId) {

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_id", String(telegramId))
    .maybeSingle();

  if (error) {
    console.error("getUser:", error.message);
    return null;
  }

  return data;
}


async function ensureUser(msg) {

  const telegramId = String(msg.from.id);

  const existing = await getUser(telegramId);

  if (existing) {
    return existing;
  }

  const username =
    msg.from.username ||
    msg.from.first_name ||
    "User";

  const { data, error } = await supabase
    .from("users")
    .insert({
      telegram_id: telegramId,
      username: username,
      role: "customer"
    })
    .select("*")
    .single();

  if (error) {
    console.error("ensureUser:", error.message);
    return null;
  }

  return data;
}


async function getProducts() {

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("id", {
      ascending: false
    });

  if (error) {
    console.error("getProducts:", error.message);
    return [];
  }

  return data || [];
}


async function getProduct(id) {

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getProduct:", error.message);
    return null;
  }

  return data;
}


/*
========================================================
ADMIN CHECK
========================================================
*/

async function isAdmin(msg) {

  const user = await getUser(msg.from.id);

  if (user && user.role === "admin") {
    return true;
  }

  return false;
}


/*
========================================================
START COMMAND
========================================================
*/

bot.onText(/^\/start$/, async (msg) => {

  try {

    const user = await ensureUser(msg);

    const admin = await isAdmin(msg);

    const name =
      msg.from.first_name ||
      msg.from.username ||
      "User";

    await bot.sendMessage(
      msg.chat.id,

      `👋 Welcome ${safeText(name)}!

🛍 *Trusted Seller Shop*

Choose an option below:`,

      {
        parse_mode: "Markdown",
        ...mainMenu(admin)
      }
    );

  } catch (error) {

    console.error("/start error:", error);

    await bot.sendMessage(
      msg.chat.id,
      "❌ Something went wrong. Please try again."
    );
  }
});


/*
========================================================
ADMIN LOGIN BY EMAIL
========================================================

Use:

/admin your@email.com

========================================================
*/

bot.onText(/^\/admin(?:\s+(.+))?$/i, async (msg, match) => {

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {

    const suppliedEmail =
      String(match?.[1] || "")
        .trim()
        .toLowerCase();

    if (!suppliedEmail) {

      await bot.sendMessage(
        chatId,
        "🔐 Admin login\n\nUse:\n/admin your-email@example.com"
      );

      return;
    }

    if (suppliedEmail !== ADMIN_EMAIL) {

      await bot.sendMessage(
        chatId,
        "❌ This email is not authorized."
      );

      return;
    }

    const user = await getUser(userId);

    if (!user) {

      await bot.sendMessage(
        chatId,
        "❌ Your Telegram account is not registered yet.\n\nSend /start first."
      );

      return;
    }

    const { error } = await supabase
      .from("users")
      .update({
        role: "admin",
        email: suppliedEmail
      })
      .eq("telegram_id", String(userId));

    if (error) {

      console.error("Admin update:", error.message);

      await bot.sendMessage(
        chatId,
        "❌ Admin account update failed."
      );

      return;
    }

    const session = getSession(userId);

    session.adminVerified = true;

    await bot.sendMessage(
      chatId,
      "✅ Admin access enabled.",
      adminMenu()
    );

  } catch (error) {

    console.error("Admin login:", error);

    await bot.sendMessage(
      chatId,
      "❌ Admin login failed."
    );
  }
});


/*
========================================================
PRODUCTS
========================================================
*/

async function sendProducts(chatId) {

  const products = await getProducts();

  if (!products.length) {

    await bot.sendMessage(
      chatId,
      "📦 No products available right now.",
      mainMenu()
    );

    return;
  }

  for (const product of products) {

    const stock = Number(product.stock || 0);

    let text =
      `🛍 *${safeText(product.name)}*\n\n` +
      `💰 Price: ${money(product.price)}\n` +
      `📦 Stock: ${stock}\n`;

    if (product.description) {
      text +=
        `\n📝 ${safeText(product.description)}\n`;
    }

    const keyboard = [];

    if (stock > 0) {

      keyboard.push([
        {
          text: "🛒 Buy",
          callback_data: `buy_${product.id}`
        }
      ]);

    } else {

      text += "\n❌ Out of stock";
    }

    await bot.sendMessage(
      chatId,
      text,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: keyboard
        }
      }
    );
  }

  await bot.sendMessage(
    chatId,
    "🏠 Main Menu",
    mainMenu()
  );
}


/*
========================================================
ACCOUNT
========================================================
*/

async function sendAccount(msg) {

  const user = await getUser(msg.from.id);

  if (!user) {

    await bot.sendMessage(
      msg.chat.id,
      "❌ Account not found."
    );

    return;
  }

  const text =
    `👤 *My Account*\n\n` +
    `🆔 Telegram ID: ${safeText(user.telegram_id)}\n` +
    `👤 Username: ${safeText(user.username || "-")}\n` +
    `📧 Email: ${safeText(user.email || "-")}\n` +
    `⭐ Role: ${safeText(user.role || "customer")}`;

  await bot.sendMessage(
    msg.chat.id,
    text,
    {
      parse_mode: "Markdown",
      ...mainMenu(user.role === "admin")
    }
  );
}


/*
========================================================
ORDERS
========================================================
*/

async function sendOrders(msg) {

  const telegramId = String(msg.from.id);

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("telegram_id", telegramId)
    .order("id", {
      ascending: false
    });

  if (error) {

    console.error("Orders:", error.message);

    await bot.sendMessage(
      msg.chat.id,
      "❌ Orders could not be loaded."
    );

    return;
  }

  if (!data?.length) {

    await bot.sendMessage(
      msg.chat.id,
      "🧾 You don't have any orders yet.",
      mainMenu()
    );

    return;
  }

  let text = "🧾 *My Orders*\n\n";

  for (const order of data.slice(0, 20)) {

    text +=
      `#${order.id} — ` +
      `${safeText(order.status || "pending")}\n`;

    if (order.amount !== undefined) {
      text += `💰 ${money(order.amount)}\n`;
    }

    text += "\n";
  }

  await bot.sendMessage(
    msg.chat.id,
    text,
    {
      parse_mode: "Markdown",
      ...mainMenu()
    }
  );
}


/*
========================================================
HELP
========================================================
*/

async function sendHelp(chatId) {

  await bot.sendMessage(
    chatId,

    `ℹ️ *Help*

🛍 Products — View available products
👤 My Account — View your account
📦 My Orders — View your orders

For support, contact the seller.`,

    {
      parse_mode: "Markdown",
      ...mainMenu()
    }
  );
}


/*
========================================================
ADMIN DASHBOARD
========================================================
*/

async function adminDashboard(chatId) {

  const { count: productCount } =
    await supabase
      .from("products")
      .select("*", {
        count: "exact",
        head: true
      });

  const { count: customerCount } =
    await supabase
      .from("users")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("role", "customer");

  const { count: orderCount } =
    await supabase
      .from("orders")
      .select("*", {
        count: "exact",
        head: true
      });

  const { data: orders } =
    await supabase
      .from("orders")
      .select("amount");

  let totalSales = 0;

  for (const order of orders || []) {
    totalSales += Number(order.amount || 0);
  }

  await bot.sendMessage(
    chatId,

    `📊 *SALES DASHBOARD*

🛍 Products:
${productCount || 0}

👥 Customers:
${customerCount || 0}

🧾 Orders:
${orderCount || 0}

💰 Total Sales:
${money(totalSales)}`,

    {
      parse_mode: "Markdown",
      ...adminMenu()
    }
  );
}


/*
========================================================
ADMIN PRODUCTS
========================================================
*/

async function adminProducts(chatId) {

  const products = await getProducts();

  if (!products.length) {

    await bot.sendMessage(
      chatId,
      "📦 No products found.",
      adminMenu()
    );

    return;
  }

  let text = "📦 *PRODUCTS*\n\n";

  for (const product of products) {

    text +=
      `🆔 ${product.id}\n` +
      `📦 ${safeText(product.name)}\n` +
      `💰 ${money(product.price)}\n` +
      `📊 Stock: ${Number(product.stock || 0)}\n\n`;
  }

  await bot.sendMessage(
    chatId,
    text,
    {
      parse_mode: "Markdown",
      ...adminMenu()
    }
  );
}


/*
========================================================
ADMIN CUSTOMERS
========================================================
*/

async function adminCustomers(chatId) {

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("role", "customer")
    .order("id", {
      ascending: false
    });

  if (error) {

    console.error("Customers:", error.message);

    await bot.sendMessage(
      chatId,
      "❌ Customers could not be loaded.",
      adminMenu()
    );

    return;
  }

  if (!data?.length) {

    await bot.sendMessage(
      chatId,
      "👥 No customers found.",
      adminMenu()
    );

    return;
  }

  let text = "👥 *CUSTOMERS*\n\n";

  for (const user of data.slice(0, 50)) {

    text +=
      `🆔 ${safeText(user.telegram_id)}\n` +
      `👤 ${safeText(user.username || "-")}\n` +
      `📧 ${safeText(user.email || "-")}\n\n`;
  }

  await bot.sendMessage(
    chatId,
    text,
    {
      parse_mode: "Markdown",
      ...adminMenu()
    }
  );
}


/*
========================================================
ADMIN ORDERS
========================================================
*/

async function adminOrders(chatId) {

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("id", {
      ascending: false
    })
    .limit(50);

  if (error) {

    console.error("Admin orders:", error.message);

    await bot.sendMessage(
      chatId,
      "❌ Orders could not be loaded.",
      adminMenu()
    );

    return;
  }

  if (!data?.length) {

    await bot.sendMessage(
      chatId,
      "🧾 No orders found.",
      adminMenu()
    );

    return;
  }

  let text = "🧾 *ALL ORDERS*\n\n";

  for (const order of data) {

    text +=
      `🆔 Order #${order.id}\n` +
      `👤 ${safeText(order.telegram_id || "-")}\n` +
      `💰 ${money(order.amount || 0)}\n` +
      `📌 ${safeText(order.status || "pending")}\n\n`;
  }

  await bot.sendMessage(
    chatId,
    text,
    {
      parse_mode: "Markdown",
      ...adminMenu()
    }
  );
}


/*
========================================================
ADD PRODUCT - START
========================================================
*/

async function startAddProduct(msg) {

  const userId = msg.from.id;

  const admin = await isAdmin(msg);

  if (!admin) {

    await bot.sendMessage(
      msg.chat.id,
      "❌ Admin access required."
    );

    return;
  }

  const session = getSession(userId);

  session.mode = "add_product_name";
  session.product = {};

  await bot.sendMessage(
    msg.chat.id,
    "➕ *Add Product*\n\nSend product name:",
    {
      parse_mode: "Markdown"
    }
  );
}


/*
========================================================
SAVE PRODUCT
========================================================
*/

async function saveProduct(msg) {

  const userId = msg.from.id;

  const session = getSession(userId);

  const product = session.product;

  const { data, error } = await supabase
    .from("products")
    .insert({
      name: product.name,
      price: product.price,
      stock: product.stock,
      description: product.description || null
    })
    .select("*")
    .single();

  if (error) {

    console.error("add product:", error.message);

    await bot.sendMessage(
      msg.chat.id,
      `❌ Product save failed.\n\n${error.message}`,
      adminMenu()
    );

    clearSession(userId);

    return;
  }

  clearSession(userId);

  await bot.sendMessage(
    msg.chat.id,

    `✅ *Product Added Successfully!*

🆔 ID: ${data.id}
📦 Name: ${safeText(data.name)}
💰 Price: ${money(data.price)}
📊 Stock: ${data.stock}`,

    {
      parse_mode: "Markdown",
      ...adminMenu()
    }
  );
}


/*
========================================================
BUY PRODUCT
========================================================
*/

async function buyProduct(msg, productId) {

  const product = await getProduct(productId);

  if (!product) {

    await bot.sendMessage(
      msg.chat.id,
      "❌ Product not found."
    );

    return;
  }

  const stock = Number(product.stock || 0);

  if (stock <= 0) {

    await bot.sendMessage(
      msg.chat.id,
      "❌ This product is out of stock."
    );

    return;
  }

  const user = await ensureUser(msg);

  if (!user) {

    await bot.sendMessage(
      msg.chat.id,
      "❌ Account setup failed."
    );

    return;
  }

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      telegram_id: String(msg.from.id),
      product_id: product.id,
      amount: Number(product.price || 0),
      status: "pending"
    })
    .select("*")
    .single();

  if (error) {

    console.error("create order:", error.message);

    await bot.sendMessage(
      msg.chat.id,
      "❌ Order could not be created."
    );

    return;
  }

  const newStock = stock - 1;

  const { error: stockError } = await supabase
    .from("products")
    .update({
      stock: newStock
    })
    .eq("id", product.id);

  if (stockError) {

    console.error("stock update:", stockError.message);

    await bot.sendMessage(
      msg.chat.id,
      `⚠️ Order created, but stock update failed.\n\nOrder ID: ${order.id}`
    );

    return;
  }

  await bot.sendMessage(

    msg.chat.id,

    `✅ *Order Created!*

🧾 Order ID: ${order.id}

📦 Product:
${safeText(product.name)}

💰 Amount:
${money(product.price)}

📌 Status:
Pending

Please contact the seller for payment/delivery details.`,

    {
      parse_mode: "Markdown",
      ...mainMenu(user.role === "admin")
    }
  );
}


/*
========================================================
CALLBACK QUERIES
========================================================
*/

bot.on("callback_query", async (query) => {

  try {

    const chatId = query.message.chat.id;
    const userId = query.from.id;

    await bot.answerCallbackQuery(query.id);

    const action = query.data;

    const fakeMsg = {
      chat: {
        id: chatId
      },
      from: query.from
    };


    /*
    ==============================
    HOME
    ==============================
    */

    if (action === "home") {

      const admin = await isAdmin(fakeMsg);

      await bot.sendMessage(
        chatId,
        "🏠 *Main Menu*",
        {
          parse_mode: "Markdown",
          ...mainMenu(admin)
        }
      );

      return;
    }


    /*
    ==============================
    PRODUCTS
    ==============================
    */

    if (action === "products") {

      await sendProducts(chatId);

      return;
    }


    /*
    ==============================
    ACCOUNT
    ==============================
    */

    if (action === "account") {

      await sendAccount(fakeMsg);

      return;
    }


    /*
    ==============================
    ORDERS
    ==============================
    */

    if (action === "help") {

      await sendHelp(chatId);

      return;
    }


    /*
    ==============================
    ADMIN PANEL
    ==============================
    */

    if (action === "admin") {

      const admin = await isAdmin(fakeMsg);

      if (!admin) {

        await bot.sendMessage(
          chatId,
          "❌ Admin access required."
        );

        return;
      }

      await bot.sendMessage(
        chatId,
        "⚙️ *Admin Panel*",
        {
          parse_mode: "Markdown",
          ...adminMenu()
        }
      );

      return;
    }


    /*
    ==============================
    ADMIN DASHBOARD
    ==============================
    */

    if (action === "admin_dashboard") {

      const admin = await isAdmin(fakeMsg);

      if (!admin) return;

      await adminDashboard(chatId);

      return;
    }


    /*
    ==============================
    ADMIN PRODUCTS
    ==============================
    */

    if (action === "admin_products") {

      const admin = await isAdmin(fakeMsg);

      if (!admin) return;

      await adminProducts(chatId);

      return;
    }


    /*
    ==============================
    ADMIN CUSTOMERS
    ==============================
    */

    if (action === "admin_customers") {

      const admin = await isAdmin(fakeMsg);

      if (!admin) return;

      await adminCustomers(chatId);

      return;
    }


    /*
    ==============================
    ADMIN ORDERS
    ==============================
    */

    if (action === "admin_orders") {

      const admin = await isAdmin(fakeMsg);

      if (!admin) return;

      await adminOrders(chatId);

      return;
    }


    /*
    ==============================
    ADD PRODUCT
    ==============================
    */

    if (action === "admin_add_product") {

      await startAddProduct(fakeMsg);

      return;
    }


    /*
    ==============================
    BUY
    ==============================
    */

    if (action.startsWith("buy_")) {

      const productId =
        action.replace("buy_", "");

      await buyProduct(
        fakeMsg,
        productId
      );

      return;
    }

  } catch (error) {

    console.error(
      "Callback error:",
      error
    );
  }
});


/*
========================================================
TEXT INPUT HANDLER
========================================================
*/

bot.on("message", async (msg) => {

  try {

    if (!msg.text) {
      return;
    }

    const text = msg.text.trim();

    /*
    Ignore commands
    */

    if (text.startsWith("/")) {
      return;
    }

    const userId = msg.from.id;

    const session = getSession(userId);

    if (!session.mode) {
      return;
    }


    /*
    ==============================
    ADD PRODUCT - NAME
    ==============================
    */

    if (session.mode === "add_product_name") {

      if (text.length < 1) {

        await bot.sendMessage(
          msg.chat.id,
          "❌ Please send a product name."
        );

        return;
      }

      session.product.name = text;

      session.mode = "add_product_price";

      await bot.sendMessage(
        msg.chat.id,
        "💰 Product price भेजो:\n\nExample: 499"
      );

      return;
    }


    /*
    ==============================
    ADD PRODUCT - PRICE
    ==============================
    */

    if (session.mode === "add_product_price") {

      const price = Number(text);

      if (
        !Number.isFinite(price) ||
        price < 0
      ) {

        await bot.sendMessage(
          msg.chat.id,
          "❌ सही price डालो.\n\nExample: 499"
        );

        return;
      }

      session.product.price = price;

      session.mode = "add_product_stock";

      await bot.sendMessage(
        msg.chat.id,
        "📦 Product stock भेजो:\n\nExample: 10"
      );

      return;
    }


    /*
    ==============================
    ADD PRODUCT - STOCK
    ==============================
    */

    if (session.mode === "add_product_stock") {

      const stock = Number(text);

      if (
        !Number.isInteger(stock) ||
        stock < 0
      ) {

        await bot.sendMessage(
          msg.chat.id,
          "❌ सही stock डालो.\n\nExample: 10"
        );

        return;
      }

      session.product.stock = stock;

      session.mode = "add_product_description";

      await bot.sendMessage(
        msg.chat.id,
        "📝 Product description भेजो.\n\nअगर description नहीं चाहिए तो `skip` लिखो."
      );

      return;
    }


    /*
    ==============================
    ADD PRODUCT - DESCRIPTION
    ==============================
    */

    if (
      session.mode ===
      "add_product_description"
    ) {

      if (
        text.toLowerCase() ===
        "skip"
      ) {

        session.product.description = null;

      } else {

        session.product.description = text;
      }

      await saveProduct(msg);

      return;
    }

  } catch (error) {

    console.error(
      "Text handler error:",
      error
    );

    await bot.sendMessage(
      msg.chat.id,
      "❌ Something went wrong."
    );
  }
});


/*
========================================================
POLLING ERROR
========================================================
*/

bot.on(
  "polling_error",
  (error) => {

    console.error(
      "Telegram polling error:",
      error.message
    );
  }
);


/*
========================================================
UNHANDLED REJECTION
========================================================
*/

process.on(
  "unhandledRejection",
  (error) => {

    console.error(
      "Unhandled rejection:",
      error
    );
  }
);


/*
========================================================
UNCAUGHT EXCEPTION
========================================================
*/

process.on(
  "uncaughtException",
  (error) => {

    console.error(
      "Uncaught exception:",
      error
    );
  }
);


/*
========================================================
START BOT
========================================================
*/

console.log(
  "🤖 Telegram Shop Bot is starting..."
);

console.log(
  "✅ Bot is running."
);
