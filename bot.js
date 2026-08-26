import TelegramBot from "node-telegram-bot-api";
import { createClient } from "@supabase/supabase-js";

/*
====================================================
        TRUSTED SELLER TELEGRAM SHOP BOT
====================================================

ENV VARIABLES REQUIRED:

BOT_TOKEN
SUPABASE_URL
SUPABASE_SECRET_KEY
ADMIN_EMAIL

OPTIONAL:

SUPPORT_USERNAME
BOT_NAME
*/

/* ==================================================
   ENV
================================================== */

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

const SUPPORT_USERNAME = String(
  process.env.SUPPORT_USERNAME || ""
).trim();

const BOT_NAME = String(
  process.env.BOT_NAME || "Trusted Seller Shop"
).trim();

/* ==================================================
   ENV CHECK
================================================== */

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

/* ==================================================
   CLIENTS
================================================== */

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

/* ==================================================
   SESSIONS
================================================== */

const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      mode: null,
      data: {}
    });
  }

  return sessions.get(userId);
}

function clearSession(userId) {
  sessions.delete(userId);
}

/* ==================================================
   HELPERS
================================================== */

function money(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function shortText(text, length = 80) {
  const value = String(text || "");

  if (value.length <= length) {
    return value;
  }

  return value.substring(0, length - 3) + "...";
}

function usernameOf(user) {
  if (user?.username) {
    return `@${user.username}`;
  }

  return user?.first_name || "User";
}

function referralCode(userId) {
  return `TS${String(userId).slice(-6)}`;
}

/* ==================================================
   MAIN MENU
================================================== */

function mainMenu(isAdmin = false) {
  return {
    reply_markup: {
      keyboard: [
        [
          "🛒 Shop Now"
        ],
        [
          "📦 My Orders",
          "👤 Profile"
        ],
        [
          "💎 Upgrade to Reseller"
        ],
        [
          "❓ How to Use",
          "🚨 Support"
        ],
        [
          "🎁 Refer & Earn"
        ]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
}
  const keyboard = [
    [
      {
        text: "🛒 Shop Now",
        callback_data: "shop"
      }
    ],

    [
      {
        text: "📦 My Orders",
        callback_data: "orders"
      },
      {
        text: "👤 Profile",
        callback_data: "profile"
      }
    ],

    [
      {
        text: "💎 Upgrade to Reseller",
        callback_data: "upgrade"
      }
    ],

    [
      {
        text: "📢 How to Use",
        callback_data: "tutorial"
      },
      {
        text: "🚨 Support",
        callback_data: "support"
      }
    ],

    [
      {
        text: "🆔 ID / LVL ID",
        callback_data: "level"
      }
    ],

    [
      {
        text: "🎁 Refer & Earn",
        callback_data: "refer"
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

/* ==================================================
   BACK BUTTON
================================================== */

function backButton() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "↩️ Back to Menu",
            callback_data: "home"
          }
        ]
      ]
    }
  };
}

/* ==================================================
   ADMIN CHECK
================================================== */

async function isAdmin(userId) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("telegram_id", String(userId))
      .maybeSingle();

    if (error) {
      console.error("Admin check error:", error.message);
      return false;
    }

    if (!data?.email) {
      return false;
    }

    return String(data.email)
      .trim()
      .toLowerCase() === ADMIN_EMAIL;
  } catch (error) {
    console.error("Admin check exception:", error);
    return false;
  }
}

/* ==================================================
   PROFILE
================================================== */

async function ensureProfile(user) {
  const telegramId = String(user.id);

  try {
    const { data: existing, error: findError } = await supabase
      .from("profiles")
      .select("*")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (findError) {
      throw findError;
    }

    if (existing) {
      return existing;
    }

    const newProfile = {
      telegram_id: telegramId,
      username: user.username || null,
      first_name: user.first_name || null,
      email: null,
      balance: 0,
      level: 1,
      referral_code: referralCode(user.id),
      referred_by: null
    };

    const { data, error } = await supabase
      .from("profiles")
      .insert(newProfile)
      .select()
      .single();

    if (error) {
      console.error("Profile create error:", error.message);
      return newProfile;
    }

    return data;
  } catch (error) {
    console.error("ensureProfile error:", error);
    return {
      telegram_id: telegramId,
      username: user.username || null,
      first_name: user.first_name || null,
      balance: 0,
      level: 1,
      referral_code: referralCode(user.id)
    };
  }
}

/* ==================================================
   HOME
================================================== */

async function sendHome(chatId, user) {
  const admin = await isAdmin(user.id);

  const text =
`🛍 <b>${escapeHtml(BOT_NAME)}</b>

Welcome <b>${escapeHtml(
    user.first_name || "User"
  )}</b> 👋

🛒 <b>Shop Now</b> — Browse products and purchase instantly

📦 <b>My Orders</b> — Check your purchase history

👤 <b>Profile</b> — Check account information

💎 <b>Upgrade to Reseller</b> — Unlock reseller benefits

📢 <b>How to Use</b> — Learn how the bot works

🚨 <b>Support</b> — Contact support

🆔 <b>ID / LVL ID</b> — Check your account level

🎁 <b>Refer & Earn</b> — Invite friends and earn rewards`;

  await bot.sendMessage(chatId, text, {
    parse_mode: "HTML",
    ...mainMenu(admin)
  });
}

/* ==================================================
   SHOP
================================================== */

async function sendProducts(chatId) {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .order("created_at", {
        ascending: false
      });

    if (error) {
      console.error("Products error:", error.message);

      await bot.sendMessage(
        chatId,
        "❌ Products load नहीं हो सके।\n\nDatabase error:\n" +
        error.message,
        backButton()
      );

      return;
    }

    if (!data || data.length === 0) {
      await bot.sendMessage(
        chatId,
        "🛒 <b>Shop Now</b>\n\nअभी कोई product available नहीं है.",
        {
          parse_mode: "HTML",
          ...backButton()
        }
      );

      return;
    }

    const buttons = [];

    for (const product of data) {
      const stock = Number(product.stock || 0);

      buttons.push([
        {
          text:
            `${product.name} — ${money(product.price)} ${
              stock > 0 ? `🟢 ${stock}` : "🔴 OUT"
            }`,
          callback_data: `product:${product.id}`
        }
      ]);
    }

    buttons.push([
      {
        text: "↩️ Back to Menu",
        callback_data: "home"
      }
    ]);

    await bot.sendMessage(
      chatId,
      "🛒 <b>Shop Store Now</b>\n\nSelect a product below:",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: buttons
        }
      }
    );
  } catch (error) {
    console.error("sendProducts error:", error);

    await bot.sendMessage(
      chatId,
      "❌ Products खोलते समय error आया.",
      backButton()
    );
  }
}

/* ==================================================
   PRODUCT DETAILS
================================================== */

async function sendProduct(chatId, productId) {
  try {
    const { data: product, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!product) {
      await bot.sendMessage(
        chatId,
        "❌ Product नहीं मिला.",
        backButton()
      );

      return;
    }

    const stock = Number(product.stock || 0);

    let text =
`🛍 <b>${escapeHtml(product.name)}</b>

💰 Price: <b>${money(product.price)}</b>
📦 Stock: <b>${stock}</b>`;

    if (product.description) {
      text += `\n\n📝 ${escapeHtml(product.description)}`;
    }

    if (stock <= 0) {
      text += "\n\n🔴 <b>Out of Stock</b>";

      await bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "↩️ Back to Shop",
                callback_data: "shop"
              }
            ]
          ]
        }
      });

      return;
    }

    await bot.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🛒 Buy Now",
              callback_data: `buy:${product.id}`
            }
          ],
          [
            {
              text: "↩️ Back to Shop",
              callback_data: "shop"
            }
          ]
        ]
      }
    });
  } catch (error) {
    console.error("sendProduct error:", error);

    await bot.sendMessage(
      chatId,
      "❌ Product खोलते समय error आया.",
      backButton()
    );
  }
}

/* ==================================================
   BUY PRODUCT
================================================== */

async function buyProduct(chatId, user, productId) {
  try {
    const profile = await ensureProfile(user);

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .maybeSingle();

    if (productError) {
      throw productError;
    }

    if (!product) {
      await bot.sendMessage(
        chatId,
        "❌ Product नहीं मिला."
      );

      return;
    }

    const price = Number(product.price || 0);
    const stock = Number(product.stock || 0);
    const balance = Number(profile.balance || 0);

    if (stock <= 0) {
      await bot.sendMessage(
        chatId,
        "❌ यह product अभी out of stock है."
      );

      return;
    }

    if (balance < price) {
      await bot.sendMessage(
        chatId,
`❌ <b>Insufficient Balance</b>

💰 Your Balance: ${money(balance)}
🛍 Product Price: ${money(price)}

पहले balance add करें.`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "💰 Add Balance",
                  callback_data: "balance"
                }
              ],
              [
                {
                  text: "↩️ Back to Shop",
                  callback_data: "shop"
                }
              ]
            ]
          }
        }
      );

      return;
    }

    const newBalance = balance - price;

    const { error: balanceError } = await supabase
      .from("profiles")
      .update({
        balance: newBalance
      })
      .eq("telegram_id", String(user.id));

    if (balanceError) {
      throw balanceError;
    }

    const newStock = stock - 1;

    const { error: stockError } = await supabase
      .from("products")
      .update({
        stock: newStock
      })
      .eq("id", product.id);

    if (stockError) {
      await supabase
        .from("profiles")
        .update({
          balance: balance
        })
        .eq("telegram_id", String(user.id));

      throw stockError;
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        telegram_id: String(user.id),
        product_id: product.id,
        product_name: product.name,
        price: price,
        status: "completed"
      })
      .select()
      .single();

    if (orderError) {
      await supabase
        .from("profiles")
        .update({
          balance: balance
        })
        .eq("telegram_id", String(user.id));

      await supabase
        .from("products")
        .update({
          stock: stock
        })
        .eq("id", product.id);

      throw orderError;
    }

    let deliveryText = "";

    if (product.delivery) {
      deliveryText =
        `\n\n📦 <b>Delivery:</b>\n<code>${escapeHtml(
          product.delivery
        )}</code>`;
    }

    await bot.sendMessage(
      chatId,
`🎉 <b>Order Successful!</b>

🧾 Order ID: <code>${escapeHtml(
        order?.id || "N/A"
      )}</code>

🛍 Product: <b>${escapeHtml(
        product.name
      )}</b>

💰 Paid: <b>${money(price)}</b>

💳 Remaining Balance: <b>${money(
        newBalance
      )}</b>${deliveryText}`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📦 My Orders",
                callback_data: "orders"
              }
            ],
            [
              {
                text: "🛒 Shop More",
                callback_data: "shop"
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
  } catch (error) {
    console.error("buyProduct error:", error);

    await bot.sendMessage(
      chatId,
      "❌ Order process नहीं हो सका.\n\n" +
      escapeHtml(error.message || "Unknown error"),
      {
        parse_mode: "HTML",
        ...backButton()
      }
    );
  }
}

/* ==================================================
   ORDERS
================================================== */

async function sendOrders(chatId, user) {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("telegram_id", String(user.id))
      .order("created_at", {
        ascending: false
      })
      .limit(20);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      await bot.sendMessage(
        chatId,
        "📦 <b>My Orders</b>\n\nअभी कोई order नहीं है.",
        {
          parse_mode: "HTML",
          ...backButton()
        }
      );

      return;
    }

    let text = "📦 <b>My Orders</b>\n\n";

    for (const order of data) {
      text +=
`🧾 <b>#${escapeHtml(
        String(order.id).slice(-8)
      )}</b>
🛍 ${text +=
        `\n📦 <b>${escapeHtml(
          String(
            order.product_name ??
            order.product ??
            order.name ??
            "Product"
          )
        )}</b>\n` +

        `🆔 Order ID: <code>${escapeHtml(
          String(order.id ?? "")
        )}</code>\n` +

        `💰 Amount: <b>${money(
          order.amount ??
          order.price ??
          order.total ??
          0
        )}</b>\n` +

        `📌 Status: <b>${escapeHtml(
          String(order.status ?? "pending")
        )}</b>\n` +

        `📅 Date: ${escapeHtml(
          order.created_at
            ? new Date(order.created_at).toLocaleString("en-IN")
            : "N/A"
        )}\n` +

        `━━━━━━━━━━━━━━━━━━\n`;
    }

    await bot.sendMessage(
      chatId,
      text,
      {
        parse_mode: "HTML",
        ...backButton()
      }
    );

  } catch (error) {

    console.error("sendOrders error:", error);

    await bot.sendMessage(
      chatId,
      "❌ <b>Orders load नहीं हो सके।</b>\n\n" +
      escapeHtml(error.message || "Unknown error"),
      {
        parse_mode: "HTML",
        ...backButton()
      }
    );
  }
}


/* =========================================================
   PROFILE
========================================================= */

async function sendProfile(chatId, user) {

  try {

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_id", String(user.id))
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {

      await bot.sendMessage(
        chatId,
        "👤 <b>My Profile</b>\n\n" +
        "आपका account अभी database में नहीं मिला।",
        {
          parse_mode: "HTML",
          ...backButton()
        }
      );

      return;
    }

    const name =
      data.first_name ??
      data.username ??
      user.first_name ??
      "User";

    const username =
      data.username ??
      user.username ??
      "Not set";

    const balance =
      data.balance ??
      0;

    await bot.sendMessage(
      chatId,

      "👤 <b>MY PROFILE</b>\n\n" +

      `👤 Name: <b>${escapeHtml(String(name))}</b>\n` +

      `🆔 Telegram ID: <code>${escapeHtml(
        String(user.id)
      )}</code>\n` +

      `📛 Username: @${escapeHtml(
        String(username).replace("@", "")
      )}\n\n` +

      `💰 Balance: <b>${money(balance)}</b>\n\n` +

      "━━━━━━━━━━━━━━━━━━",

      {
        parse_mode: "HTML",
        ...backButton()
      }
    );

  } catch (error) {

    console.error("profile error:", error);

    await bot.sendMessage(
      chatId,
      "❌ Profile load नहीं हो सका।\n\n" +
      escapeHtml(error.message || "Unknown error"),
      {
        parse_mode: "HTML",
        ...backButton()
      }
    );
  }
}


/* =========================================================
   SUPPORT
========================================================= */

async function sendSupport(chatId) {

  await bot.sendMessage(
    chatId,

    "🆘 <b>SUPPORT</b>\n\n" +

    "अगर आपको कोई problem आ रही है तो admin से contact करें.\n\n" +

    "📩 <b>Support Admin</b>\n" +
    "अपनी problem और Order ID भेजें।\n\n" +

    "━━━━━━━━━━━━━━━━━━",

    {
      parse_mode: "HTML",
      ...backButton()
    }
  );
}


/* =========================================================
   HOW TO USE
========================================================= */

async function sendTutorial(chatId) {

  await bot.sendMessage(
    chatId,

    "📖 <b>HOW TO USE</b>\n\n" +

    "🛍 <b>Shop Now</b>\n" +
    "Products देखने और purchase करने के लिए Shop Now दबाएँ।\n\n" +

    "🧾 <b>My Orders</b>\n" +
    "अपने पुराने orders और उनकी status देखने के लिए My Orders दबाएँ।\n\n" +

    "👤 <b>Profile</b>\n" +
    "अपना account और balance देखने के लिए Profile दबाएँ।\n\n" +

    "🆘 <b>Support</b>\n" +
    "किसी problem के लिए Support से contact करें।",

    {
      parse_mode: "HTML",
      ...backButton()
    }
  );
}


/* =========================================================
   MAIN MESSAGE HANDLER
========================================================= */

bot.on("message", async (msg) => {

  try {

    if (!msg || !msg.chat) {
      return;
    }

    const chatId = msg.chat.id;
    const user = msg.from;

    if (!user) {
      return;
    }

    const messageText =
      String(msg.text || "").trim();

    if (!messageText) {
      return;
    }


    /* START */

    if (messageText === "/start") {

      await bot.sendMessage(
        chatId,

        "🛍 <b>Welcome to Trusted Seller Shop!</b>\n\n" +

        "Bot successfully connected ✅\n\n" +

        "नीचे menu से option select करें:",

        {
          parse_mode: "HTML",
          ...mainMenu(false)
        }
      );

      return;
    }


    /* SUPPORT COMMAND */

    if (messageText === "/support") {

      await sendSupport(chatId);

      return;
    }


    /* ORDERS COMMAND */

    if (messageText === "/orders") {

      await sendOrders(chatId, user);

      return;
    }


    /* PROFILE COMMAND */

    if (messageText === "/profile") {

      await sendProfile(chatId, user);

      return;
    }


    /* UNKNOWN TEXT */

    await bot.sendMessage(
      chatId,

      "👇 <b>Menu से कोई option select करें।</b>",

      {
        parse_mode: "HTML",
        ...mainMenu(false)
      }
    );

  } catch (error) {

    console.error(
      "message handler error:",
      error
    );

  }

});


/* =========================================================
   CALLBACK QUERY HANDLER
========================================================= */

bot.on("callback_query", async (query) => {

  try {

    const chatId =
      query.message?.chat?.id;

    const user =
      query.from;

    const action =
      String(query.data || "");

    if (!chatId || !user) {
      return;
    }


    await bot.answerCallbackQuery(
      query.id
    );


    /* HOME */

    if (action === "home") {

      await bot.sendMessage(
        chatId,

        "🏠 <b>Main Menu</b>\n\n" +
        "नीचे से कोई option select करें:",

        {
          parse_mode: "HTML",
          ...mainMenu(false)
        }
      );

      return;
    }


    /* PRODUCTS / SHOP */

    if (
      action === "products" ||
      action === "shop"
    ) {

      await sendProducts(chatId);

      return;
    }


    /* ORDERS */

    if (
      action === "orders" ||
      action === "my_orders"
    ) {

      await sendOrders(
        chatId,
        user
      );

      return;
    }


    /* PROFILE / ACCOUNT */

    if (
      action === "profile" ||
      action === "account"
    ) {

      await sendProfile(
        chatId,
        user
      );

      return;
    }


    /* SUPPORT */

    if (action === "support") {

      await sendSupport(chatId);

      return;
    }


    /* TUTORIAL */

    if (
      action === "tutorial" ||
      action === "how_to_use"
    ) {

      await sendTutorial(chatId);

      return;
    }


    /* BACK */

    if (action === "back") {

      await bot.sendMessage(
        chatId,
        "🏠 <b>Main Menu</b>",
        {
          parse_mode: "HTML",
          ...mainMenu(false)
        }
      );

      return;
    }


    console.log(
      "Unknown callback:",
      action
    );

  } catch (error) {

    console.error(
      "callback_query error:",
      error
    );

  }

});


/* =========================================================
   BOT ERROR HANDLING
========================================================= */

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


/* =========================================================
   START BOT
========================================================= */

console.log(
  "🤖 Telegram Shop Bot is starting..."
);

console.log(
  "✅ Bot is running."
);
