import TelegramBot from "node-telegram-bot-api";
import { createClient } from "@supabase/supabase-js";

/*
========================================
ENVIRONMENT VARIABLES
========================================

BOT_TOKEN
SUPABASE_URL
SUPABASE_SECRET_KEY
ADMIN_EMAIL

Example:

BOT_TOKEN=123456:ABC...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SECRET_KEY=xxxxx
ADMIN_EMAIL=your@email.com
*/

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const ADMIN_EMAIL = String(
  process.env.ADMIN_EMAIL || ""
).trim().toLowerCase();

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
========================================
CLIENTS
========================================
*/

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


/*
========================================
SESSIONS
========================================
*/

const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      mode: null,
      product: {}
    });
  }

  return sessions.get(userId);
}

function clearSession(userId) {
  sessions.delete(userId);
}


/*
========================================
HELPERS
========================================
*/

function money(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
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


/*
========================================
USER
========================================
*/

async function getUser(telegramId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (error) {
    console.error("getUser:", error);
    return null;
  }

  return data;
}


async function saveUser(ctx, email) {
  const telegramId = String(ctx.from.id);

  const cleanEmail = String(email)
    .trim()
    .toLowerCase();

  const role =
    cleanEmail === ADMIN_EMAIL
      ? "admin"
      : "customer";

  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        telegram_id: telegramId,
        username: ctx.from.username || null,
        first_name: ctx.from.first_name || null,
        email: cleanEmail,
        role: role
      },
      {
        onConflict: "telegram_id"
      }
    )
    .select()
    .single();

  if (error) {
    console.error("saveUser:", error);
    return null;
  }

  return data;
}


async function isAdmin(ctx) {
  const user = await getUser(
    String(ctx.from.id)
  );

  if (!user) {
    return false;
  }

  return (
    String(user.email || "")
      .trim()
      .toLowerCase() === ADMIN_EMAIL
  );
}


/*
========================================
START
========================================
*/

bot.onText(/^\/start$/, async (msg) => {
  const userId = String(msg.from.id);

  const user = await getUser(userId);

  if (!user) {
    sessions.set(userId, {
      mode: "email",
      product: {}
    });

    await bot.sendMessage(
      msg.chat.id,
      "👋 Welcome!\n\n" +
      "Please enter your email address to continue."
    );

    return;
  }

  const admin = await isAdmin({
    from: msg.from
  });

  await bot.sendMessage(
    msg.chat.id,
    "🏠 Welcome back!\n\n" +
    "Choose an option below:",
    mainMenu(admin)
  );
});


/*
========================================
PRODUCT LIST
========================================
*/

async function showProducts(chatId) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("id", {
      ascending: false
    });

  if (error) {
    console.error("products:", error);

    await bot.sendMessage(
      chatId,
      "❌ Products load नहीं हो सके."
    );

    return;
  }

  if (!data || data.length === 0) {
    await bot.sendMessage(
      chatId,
      "📦 अभी कोई product available नहीं है."
    );

    return;
  }

  for (const product of data) {
    const stock =
      Number(product.stock || 0);

    const text =
      `📦 ${product.name}\n\n` +
      `${product.description || "No description"}\n\n` +
      `💰 Price: ${money(product.price)}\n` +
      `📊 Stock: ${stock}`;

    const buttons = [];

    if (stock > 0) {
      buttons.push([
        {
          text: "🛒 Buy",
          callback_data:
            `buy_${product.id}`
        }
      ]);
    }

    await bot.sendMessage(
      chatId,
      text,
      {
        reply_markup: {
          inline_keyboard: buttons
        }
      }
    );
  }
}


/*
========================================
ADMIN MENU
========================================
*/

async function showAdminMenu(chatId) {
  await bot.sendMessage(
    chatId,
    "⚙️ ADMIN PANEL",
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "➕ Add Product",
              callback_data: "add_product"
            }
          ],
          [
            {
              text: "📦 Products",
              callback_data: "products"
            }
          ],
          [
            {
              text: "📊 Dashboard",
              callback_data: "dashboard"
            }
          ],
          [
            {
              text: "👥 Customers",
              callback_data: "customers"
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
    }
  );
}


/*
========================================
DASHBOARD
========================================
*/

async function showDashboard(chatId) {
  const { data: products } = await supabase
    .from("products")
    .select("id,stock,price");

  const { count: customers } = await supabase
    .from("users")
    .select("*", {
      count: "exact",
      head: true
    })
    .eq("role", "customer");

  let totalProducts = 0;
  let totalStock = 0;

  for (const product of products || []) {
    totalProducts++;

    totalStock += Number(
      product.stock || 0
    );
  }

  await bot.sendMessage(
    chatId,
    "📊 SALES DASHBOARD\n\n" +
    `📦 Total Products: ${totalProducts}\n` +
    `📊 Total Stock: ${totalStock}\n` +
    `👥 Customers: ${customers || 0}`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "⚙️ Admin Panel",
              callback_data: "admin"
            }
          ]
        ]
      }
    }
  );
}


/*
========================================
CUSTOMERS
========================================
*/

async function showCustomers(chatId) {
  const { data, error } = await supabase
    .from("users")
    .select(
      "telegram_id,username,first_name,email,role"
    )
    .eq("role", "customer")
    .order("telegram_id", {
      ascending: false
    })
    .limit(50);

  if (error) {
    console.error(error);

    await bot.sendMessage(
      chatId,
      "❌ Customers load नहीं हो सके."
    );

    return;
  }

  if (!data || data.length === 0) {
    await bot.sendMessage(
      chatId,
      "👥 No customers found."
    );

    return;
  }

  let text = "👥 CUSTOMERS\n\n";

  data.forEach((user, index) => {
    text +=
      `${index + 1}. ` +
      `${user.first_name || "User"}\n` +
      `📧 ${user.email || "-"}\n` +
      `👤 @${user.username || "-"}\n\n`;
  });

  await bot.sendMessage(
    chatId,
    text
  );
}


/*
========================================
ADD PRODUCT
========================================
*/

async function startAddProduct(chatId, userId) {
  sessions.set(userId, {
    mode: "add_name",
    product: {}
  });

  await bot.sendMessage(
    chatId,
    "➕ ADD PRODUCT\n\n" +
    "Product name भेजो:"
  );
}


/*
========================================
TEXT HANDLER
========================================
*/

bot.on("message", async (msg) => {
  if (!msg.text) {
    return;
  }

  if (msg.text.startsWith("/")) {
    return;
  }

  const userId = String(msg.from.id);
  const chatId = msg.chat.id;

  const session = sessions.get(userId);

  if (!session || !session.mode) {
    return;
  }


  /*
  ================================
  EMAIL
  ================================
  */

  if (session.mode === "email") {
    const email = msg.text
      .trim()
      .toLowerCase();

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      await bot.sendMessage(
        chatId,
        "❌ सही email डालो.\n\n" +
        "Example:\n" +
        "example@gmail.com"
      );

      return;
    }

    const user = await saveUser(
      {
        from: msg.from
      },
      email
    );

    if (!user) {
      await bot.sendMessage(
        chatId,
        "❌ Account save नहीं हुआ.\n" +
        "Supabase settings check करो."
      );

      return;
    }

    clearSession(userId);

    const admin =
      email === ADMIN_EMAIL;

    await bot.sendMessage(
      chatId,
      admin
        ? "✅ Admin account connected!\n\nWelcome Admin."
        : "✅ Account created successfully!",
      mainMenu(admin)
    );

    return;
  }


  /*
  ================================
  ADD PRODUCT NAME
  ================================
  */

  if (session.mode === "add_name") {
    session.product.name =
      msg.text.trim();

    if (!session.product.name) {
      await bot.sendMessage(
        chatId,
        "❌ Product name खाली नहीं हो सकता."
      );

      return;
    }

    session.mode =
      "add_description";

    await bot.sendMessage(
      chatId,
      "📝 Product description भेजो:"
    );

    return;
  }


  /*
  ================================
  ADD PRODUCT DESCRIPTION
  ================================
  */

  if (
    session.mode ===
    "add_description"
  ) {
    session.product.description =
      msg.text.trim();

    session.mode =
      "add_price";

    await bot.sendMessage(
      chatId,
      "💰 Product price भेजो:\n\n" +
      "Example: 499"
    );

    return;
  }


  /*
  ================================
  ADD PRODUCT PRICE
  ================================
  */

  if (session.mode === "add_price") {
    const price =
      Number(msg.text.trim());

    if (
      !Number.isFinite(price) ||
      price < 0
    ) {
      await bot.sendMessage(
        chatId,
        "❌ सही price डालो.\n\n" +
        "Example: 499"
      );

      return;
    }

    session.product.price =
      price;

    session.mode =
      "add_stock";

    await bot.sendMessage(
      chatId,
      "📦 Product stock भेजो:\n\n" +
      "Example: 10"
    );

    return;
  }


  /*
  ================================
  ADD PRODUCT STOCK
  ================================
  */

  if (session.mode === "add_stock") {
    const stock =
      Number(msg.text.trim());

    if (
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      await bot.sendMessage(
        chatId,
        "❌ सही stock डालो.\n\n" +
        "Example: 10"
      );

      return;
    }

    session.product.stock =
      stock;

    const { data, error } =
      await supabase
        .from("products")
        .insert({
          name:
            session.product.name,
          description:
            session.product.description,
          price:
            session.product.price,
          stock:
            session.product.stock
        })
        .select()
        .single();

    if (error) {
      console.error(
        "Product insert:",
        error
      );

      await bot.sendMessage(
        chatId,
        "❌ Product save नहीं हुआ.\n\n" +
        error.message
      );

      return;
    }

    const productName =
      data.name;

    const productPrice =
      data.price;

    const productStock =
      data.stock;

    clearSession(userId);

    await bot.sendMessage(
      chatId,
      "✅ PRODUCT ADDED!\n\n" +
      `📦 Name: ${productName}\n` +
      `💰 Price: ${money(productPrice)}\n` +
      `📊 Stock: ${productStock}`,
      mainMenu(true)
    );

    return;
  }
});


/*
========================================
CALLBACK BUTTONS
========================================
*/

bot.on(
  "callback_query",
  async (query) => {
    const chatId =
      query.message.chat.id;

    const userId =
      String(query.from.id);

    const action =
      query.data;

    try {
      await bot.answerCallbackQuery(
        query.id
      );
    } catch (_) {}


    /*
    ================================
    HOME
    ================================
    */

    if (action === "home") {
      const admin =
        await isAdmin({
          from: query.from
        });

      await bot.sendMessage(
        chatId,
        "🏠 MAIN MENU",
        mainMenu(admin)
      );

      return;
    }


    /*
    ================================
    PRODUCTS
    ================================
    */

    if (action === "products") {
      await showProducts(chatId);
      return;
    }


    /*
    ================================
    ACCOUNT
    ================================
    */

    if (action === "account") {
      const user =
        await getUser(userId);

      if (!user) {
        await bot.sendMessage(
          chatId,
          "❌ Account नहीं मिला.\n" +
          "पहले /start करो."
        );

        return;
      }

      await bot.sendMessage(
        chatId,
        "👤 MY ACCOUNT\n\n" +
        `📧 Email: ${user.email || "-"}\n` +
        `👤 Username: @${user.username || "-"}\n` +
        `🔐 Role: ${user.role || "customer"}`,
        mainMenu(
          String(user.email || "")
            .toLowerCase() ===
            ADMIN_EMAIL
        )
      );

      return;
    }


    /*
    ================================
    ADMIN
    ================================
    */

    if (action === "admin") {
      const admin =
        await isAdmin({
          from: query.from
        });

      if (!admin) {
        await bot.sendMessage(
          chatId,
          "❌ Admin access denied."
        );

        return;
      }

      await showAdminMenu(chatId);
      return;
    }


    /*
    ================================
    ADD PRODUCT
    ================================
    */

    if (action === "add_product") {
      const admin =
        await isAdmin({
          from: query.from
        });

      if (!admin) {
        await bot.sendMessage(
          chatId,
          "❌ Admin access denied."
        );

        return;
      }

      await startAddProduct(
        chatId,
        userId
      );

      return;
    }


    /*
    ================================
    DASHBOARD
    ================================
    */

    if (action === "dashboard") {
      const admin =
        await isAdmin({
          from: query.from
        });

      if (!admin) {
        await bot.sendMessage(
          chatId,
          "❌ Admin access denied."
        );

        return;
      }

      await showDashboard(chatId);
      return;
    }


    /*
    ================================
    CUSTOMERS
    ================================
    */

    if (action === "customers") {
      const admin =
        await isAdmin({
          from: query.from
        });

      if (!admin) {
        await bot.sendMessage(
          chatId,
          "❌ Admin access denied."
        );

        return;
      }

      await showCustomers(chatId);
      return;
    }


    /*
    ================================
    BUY PRODUCT
    ================================
    */

    if (action.startsWith("buy_")) {
      const productId =
        action.replace(
          "buy_",
          ""
        );

      const { data: product, error } =
        await supabase
          .from("products")
          .select("*")
          .eq("id", productId)
          .maybeSingle();

      if (error || !product) {
        await bot.sendMessage(
          chatId,
          "❌ Product नहीं मिला."
        );

        return;
      }

      if (
        Number(product.stock || 0) <=
        0
      ) {
        await bot.sendMessage(
          chatId,
          "❌ यह product out of stock है."
        );

        return;
      }

      await bot.sendMessage(
        chatId,
        "🛒 PRODUCT\n\n" +
        `📦 ${product.name}\n\n` +
        `${product.description || ""}\n\n` +
        `💰 Price: ${money(product.price)}\n` +
        `📊 Stock: ${product.stock}\n\n` +
        "💳 Purchase करने के लिए Admin से contact करें."
      );

      return;
    }
  }
);


/*
========================================
ERROR HANDLING
========================================
*/

bot.on("polling_error", (error) => {
  console.error(
    "Telegram polling error:",
    error.message
  );
});


process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "Unhandled rejection:",
      error
    );
  }
);


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
========================================
START BOT
========================================
*/

console.log(
  "🤖 Telegram Shop Bot is starting..."
);

console.log(
  "✅ Bot is running."
);
