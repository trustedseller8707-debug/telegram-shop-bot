import { Telegraf, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import http from "http";

/* =========================
   ENVIRONMENT
========================= */

const BOT_TOKEN = process.env.BOT_TOKEN;

const SUPABASE_URL = process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const ADMIN_ID = String(process.env.ADMIN_ID || "");

const SUPPORT_USERNAME =
  process.env.SUPPORT_USERNAME || "trusted_seller_support";

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is missing");
}

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is missing");
}

if (!SUPABASE_KEY) {
  throw new Error("SUPABASE_SECRET_KEY is missing");
}

/* =========================
   CLIENTS
========================= */

const bot = new Telegraf(BOT_TOKEN);

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  }
);

/* =========================
   SIMPLE SESSION
========================= */

const sessions = new Map();

function session(id) {
  if (!sessions.has(id)) {
    sessions.set(id, {});
  }

  return sessions.get(id);
}

function clearSession(id) {
  sessions.delete(id);
}

/* =========================
   HELPERS
========================= */

function isAdmin(ctx) {
  return ADMIN_ID &&
    String(ctx.from.id) === ADMIN_ID;
}

function money(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

async function ensureUser(ctx) {

  const telegramId = ctx.from.id;

  const username =
    ctx.from.username || null;

  const firstName =
    ctx.from.first_name || "Customer";

  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        telegram_id: telegramId,
        username,
        first_name: firstName,
        role: isAdmin(ctx) ? "admin" : "customer"
      },
      {
        onConflict: "telegram_id"
      }
    )
    .select()
    .single();

  if (error) {
    console.error("User error:", error);
    return null;
  }

  return data;
}

/* =========================
   MAIN MENU
========================= */

function mainMenu(ctx) {

  const buttons = [
    [
      Markup.button.callback(
        "🛒 Products",
        "products"
      )
    ],
    [
      Markup.button.callback(
        "📦 My Orders",
        "myorders"
      ),
      Markup.button.callback(
        "👤 My Account",
        "account"
      )
    ],
    [
      Markup.button.url(
        "💬 Support",
        `https://t.me/${SUPPORT_USERNAME.replace("@", "")}`
      )
    ]
  ];

  if (isAdmin(ctx)) {
    buttons.push([
      Markup.button.callback(
        "⚙️ Admin Panel",
        "admin"
      )
    ]);
  }

  return Markup.inlineKeyboard(buttons);
}

/* =========================
   START
========================= */

bot.start(async (ctx) => {

  await ensureUser(ctx);

  await ctx.reply(
    `🛍️ TRUSTED SELLER SHOP

Welcome ${ctx.from.first_name || ""} 👋

Choose an option below:`,
    mainMenu(ctx)
  );
});

/* =========================
   ID COMMAND
========================= */

bot.command("id", async (ctx) => {

  await ctx.reply(
    `🆔 Your Telegram ID:

${ctx.from.id}

Use this ID as ADMIN_ID in Render if this is your admin account.`
  );

});

/* =========================
   MENU
========================= */

bot.command("menu", async (ctx) => {

  await ensureUser(ctx);

  await ctx.reply(
    "🛍️ SHOP MENU",
    mainMenu(ctx)
  );

});

/* =========================
   PRODUCTS
========================= */

async function showProducts(ctx) {

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("active", true)
    .order("created_at", {
      ascending: false
    });

  if (error) {
    console.error(error);
    return ctx.reply(
      "❌ Products load नहीं हो पाए।"
    );
  }

  if (!data || data.length === 0) {
    return ctx.reply(
      "📦 अभी कोई product available नहीं है।"
    );
  }

  const buttons = data.map(product => {

    const stockText =
      product.stock > 0
        ? `🟢 ${product.stock} left`
        : "🔴 Out of stock";

    return [
      Markup.button.callback(
        `${product.name} • ${money(product.price)} • ${stockText}`,
        `product:${product.id}`
      )
    ];
  });

  buttons.push([
    Markup.button.callback(
      "🏠 Main Menu",
      "home"
    )
  ]);

  await ctx.reply(
    "🛒 AVAILABLE PRODUCTS",
    Markup.inlineKeyboard(buttons)
  );
}

bot.action("products", async (ctx) => {

  await ctx.answerCbQuery();

  await showProducts(ctx);
});

/* =========================
   PRODUCT DETAILS
========================= */

bot.action(/^product:(.+)$/, async (ctx) => {

  await ctx.answerCbQuery();

  const productId = ctx.match[1];

  const { data: product, error } =
    await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("active", true)
      .single();

  if (error || !product) {
    return ctx.reply(
      "❌ Product नहीं मिला।"
    );
  }

  const stock =
    product.stock > 0
      ? `🟢 ${product.stock} available`
      : "🔴 Out of stock";

  const text =
`📦 ${product.name}

${product.description || "No description"}

💰 Price: ${money(product.price)}
📦 Stock: ${stock}`;

  const buttons = [];

  if (product.stock > 0) {
    buttons.push([
      Markup.button.callback(
        "🛒 Buy Now",
        `buy:${product.id}`
      )
    ]);
  }

  buttons.push([
    Markup.button.callback(
      "🔙 Products",
      "products"
    )
  ]);

  await ctx.reply(
    text,
    Markup.inlineKeyboard(buttons)
  );
});

/* =========================
   BUY
========================= */

bot.action(/^buy:(.+)$/, async (ctx) => {

  await ctx.answerCbQuery();

  const productId = ctx.match[1];

  await ensureUser(ctx);

  const { data: orderId, error } =
    await supabase.rpc(
      "create_shop_order",
      {
        p_telegram_id: ctx.from.id,
        p_product_id: productId
      }
    );

  if (error) {

    console.error("Order error:", error);

    if (
      error.message?.includes("OUT_OF_STOCK")
    ) {
      return ctx.reply(
        "❌ यह product अभी out of stock है।"
      );
    }

    return ctx.reply(
      "❌ Order create नहीं हो पाया।"
    );
  }

  await ctx.reply(
`✅ ORDER CREATED

🧾 Order ID:
${orderId}

📌 Status: Pending

Admin आपका order verify करेगा।`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "📦 My Orders",
          "myorders"
        )
      ],
      [
        Markup.button.callback(
          "🏠 Home",
          "home"
        )
      ]
    ])
  );
});

/* =========================
   MY ORDERS
========================= */

bot.action("myorders", async (ctx) => {

  await ctx.answerCbQuery();

  const { data: user } =
    await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", ctx.from.id)
      .single();

  if (!user) {
    return ctx.reply(
      "❌ Account नहीं मिला। /start दबाएँ।"
    );
  }

  const { data: orders, error } =
    await supabase
      .from("orders")
      .select(`
        id,
        total,
        status,
        created_at,
        order_items (
          product_name,
          price,
          quantity
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", {
        ascending: false
      })
      .limit(20);

  if (error) {
    console.error(error);
    return ctx.reply(
      "❌ Orders load नहीं हो पाए।"
    );
  }

  if (!orders?.length) {
    return ctx.reply(
      "📦 आपने अभी कोई order नहीं किया।"
    );
  }

  let text = "📦 MY ORDERS\n\n";

  for (const order of orders) {

    const item =
      order.order_items?.[0];

    text +=
`🧾 ${order.id.slice(0, 8)}
📦 ${item?.product_name || "Product"}
💰 ${money(order.total)}
📌 ${order.status.toUpperCase()}
📅 ${new Date(order.created_at).toLocaleString("en-IN")}

`;
  }

  await ctx.reply(
    text,
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "🏠 Home",
          "home"
        )
      ]
    ])
  );
});

/* =========================
   ACCOUNT
========================= */

bot.action("account", async (ctx) => {

  await ctx.answerCbQuery();

  const { data: user, error } =
    await supabase
      .from("users")
      .select("*")
      .eq("telegram_id", ctx.from.id)
      .single();

  if (error || !user) {
    return ctx.reply(
      "❌ Account नहीं मिला।"
    );
  }

  const { count } =
    await supabase
      .from("orders")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("user_id", user.id);

  await ctx.reply(
`👤 MY ACCOUNT

Name: ${user.first_name || "-"}
Username: ${user.username ? "@" + user.username : "-"}
Telegram ID: ${user.telegram_id}
Email: ${user.email || "Not added"}
Orders: ${count || 0}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "📧 Add / Change Email",
          "setemail"
        )
      ],
      [
        Markup.button.callback(
          "🏠 Home",
          "home"
        )
      ]
    ])
  );
});

/* =========================
   EMAIL
========================= */

bot.action("setemail", async (ctx) => {

  await ctx.answerCbQuery();

  const s = session(ctx.from.id);

  s.mode = "email";

  await ctx.reply(
    "📧 अपना Gmail/email भेजो:\n\nExample:\naditya@gmail.com"
  );
});

/* =========================
   ADMIN PANEL
========================= */

function adminMenu() {

  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "➕ Add Product",
        "admin:add"
      )
    ],
    [
      Markup.button.callback(
        "📦 Manage Products",
        "admin:products"
      )
    ],
    [
      Markup.button.callback(
        "📋 Orders",
        "admin:orders"
      )
    ],
    [
      Markup.button.callback(
        "📊 Sales",
        "admin:sales"
      )
    ],
    [
      Markup.button.callback(
        "👥 Customers",
        "admin:customers"
      )
    ],
    [
      Markup.button.callback(
        "🏠 Main Menu",
        "home"
      )
    ]
  ]);
}

bot.action("admin", async (ctx) => {

  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) {
    return ctx.reply(
      "⛔ Admin access denied."
    );
  }

  await ctx.reply(
    "⚙️ ADMIN PANEL",
    adminMenu()
  );
});

/* =========================
   ADMIN ADD PRODUCT
========================= */

bot.action("admin:add", async (ctx) => {

  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const s = session(ctx.from.id);

  s.mode = "add_name";
  s.product = {};

  await ctx.reply(
    "➕ ADD PRODUCT\n\nProduct का नाम भेजो:"
  );
});

/* =========================
   ADMIN PRODUCTS
========================= */

bot.action("admin:products", async (ctx) => {

  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const { data: products, error } =
    await supabase
      .from("products")
      .select("*")
      .order("created_at", {
        ascending: false
      });

  if (error) {
    console.error(error);
    return ctx.reply(
      "❌ Products load नहीं हुए।"
    );
  }

  if (!products?.length) {
    return ctx.reply(
      "📦 कोई product नहीं है।",
      adminMenu()
    );
  }

  for (const p of products) {

    await ctx.reply(
`📦 ${p.name}

💰 ${money(p.price)}
📦 Stock: ${p.stock}
Status: ${p.active ? "🟢 Active" : "🔴 Disabled"}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🗑️ Delete",
            `delp:${p.id}`
          ),
          Markup.button.callback(
            "📦 Stock",
            `stock:${p.id}`
          )
        ],
        [
          Markup.button.callback(
            "💰 Price",
            `price:${p.id}`
          )
        ]
      ])
    );
  }

});

/* =========================
   DELETE PRODUCT
========================= */

bot.action(/^delp:(.+)$/, async (ctx) => {

  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const productId = ctx.match[1];

  const { error } =
    await supabase
      .from("products")
      .update({
        active: false
      })
      .eq("id", productId);

  if (error) {
    console.error(error);
    return ctx.reply(
      "❌ Delete नहीं हुआ।"
    );
  }

  await ctx.reply(
    "🗑️ Product successfully removed from shop."
  );
});

/* =========================
   STOCK
========================= */

bot.action(/^stock:(.+)$/, async (ctx) => {

  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const s = session(ctx.from.id);

  s.mode = "stock";
  s.productId = ctx.match[1];

  await ctx.reply(
    "📦 नया stock quantity भेजो:\n\nExample: 25"
  );
});

/* =========================
   PRICE
========================= */

bot.action(/^price:(.+)$/, async (ctx) => {

  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const s = session(ctx.from.id);

  s.mode = "price";
  s.productId = ctx.match[1];

  await ctx.reply(
    "💰 नया price भेजो:\n\nExample: 499"
  );
});

/* =========================
   ADMIN ORDERS
========================= */

bot.action("admin:orders", async (ctx) => {

  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const { data: orders, error } =
    await supabase
      .from("orders")
      .select(`
        id,
        total,
        status,
        created_at,
        users (
          telegram_id,
          username,
          first_name
        ),
        order_items (
          product_name,
          price,
          quantity
        )
      `)
      .order("created_at", {
        ascending: false
      })
      .limit(30);

  if (error) {
    console.error(error);
    return ctx.reply(
      "❌ Orders load नहीं हुए।"
    );
  }

  if (!orders?.length) {
    return ctx.reply(
      "📋 अभी कोई order नहीं है।"
    );
  }

  for (const order of orders) {

    const item =
      order.order_items?.[0];

    const user =
      order.users;

    let text =
`🧾 ORDER

ID: ${order.id}
Product: ${item?.product_name || "-"}
Price: ${money(order.total)}

Customer:
${user?.first_name || "-"}
${user?.username ? "@" + user.username : ""}
Telegram ID: ${user?.telegram_id || "-"}

Status: ${order.status}`;

    const buttons = [];

    if (order.status === "pending") {

      buttons.push([
        Markup.button.callback(
          "✅ Confirm",
          `confirm:${order.id}`
        ),
        Markup.button.callback(
          "❌ Cancel",
          `cancel:${order.id}`
        )
      ]);

    }

    await ctx.reply(
      text,
      buttons.length
        ? Markup.inlineKeyboard(buttons)
        : undefined
    );
  }

});

/* =========================
   CONFIRM ORDER
========================= */

bot.action(/^confirm:(.+)$/, async (ctx) => {

  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const orderId = ctx.match[1];

  const { error } =
    await supabase
      .from("orders")
      .update({
        status: "confirmed"
      })
      .eq("id", orderId)
      .eq("status", "pending");

  if (error) {
    console.error(error);
    return ctx.reply(
      "❌ Order confirm नहीं हुआ।"
    );
  }

  await ctx.reply(
    `✅ Order confirmed\n\n${orderId}`
  );
});

/* =========================
   CANCEL ORDER
========================= */

bot.action(/^cancel:(.+)$/, async (ctx) => {

  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const orderId = ctx.match[1];

  const { data: order } =
    await supabase
      .from("orders")
      .select("status")
      .eq("id", orderId)
      .single();

  if (!order) {
    return ctx.reply(
      "❌ Order नहीं मिला।"
    );
  }

  if (order.status !== "pending") {
    return ctx.reply(
      "⚠️ यह order पहले ही process हो चुका है।"
    );
  }

  const { data: items } =
    await supabase
      .from("order_items")
      .select("product_id, quantity")
      .eq("order_id", orderId);

  for (const item of items || []) {

    if (!item.product_id) continue;

    const { data: product } =
      await supabase
        .from("products")
        .select("stock")
        .eq("id", item.product_id)
        .single();

    if (product) {

      await supabase
        .from("products")
        .update({
          stock:
            product.stock + item.quantity,
          updated_at: new Date().toISOString()
        })
        .eq("id", item.product_id);
    }
  }

  const { error } =
    await supabase
      .from("orders")
      .update({
        status: "cancelled"
      })
      .eq("id", orderId);

  if (error) {
    console.error(error);
    return ctx.reply(
      "❌ Order cancel नहीं हुआ।"
    );
  }

  await ctx.reply(
    `❌ Order cancelled\n\n${orderId}\n\nStock restored.`
  );
});

/* =========================
   SALES
========================= */

bot.action("admin:sales", async (ctx) => {

  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const { data: orders } =
    await supabase
      .from("orders")
      .select("total")
      .eq("status", "confirmed");

  const totalSales =
    (orders || []).reduce(
      (sum, order) =>
        sum + Number(order.total || 0),
      0
    );

  const totalOrders =
    orders?.length || 0;

  const { count: customers } =
    await supabase
      .from("users")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("role", "customer");

  await ctx.reply(
`📊 SALES DASHBOARD

💰 Total Sales:
${money(totalSales)}

📦 Confirmed Orders:
${totalOrders}

👥 Customers:
${customers || 0}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "⚙️ Admin Panel",
          "admin"
        )
      ]
    ])
  );
});

/* =========================
   CUSTOMERS
========================= */

bot.action("admin:customers", async (ctx) => {

  await ctx.answerCbQuery();

  if (!isAdmin(ctx)) return;

  const { count } =
    await supabase
      .from("users")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("role", "customer");

  await ctx.reply(
`👥 CUSTOMERS

Total customers:
${count || 0}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "⚙️ Admin Panel",
          "admin"
        )
      ]
    ])
  );
});

/* =========================
   TEXT INPUT HANDLER
========================= */

bot.on("text", async (ctx) => {

  const userId = ctx.from.id;

  const s = sessions.get(userId);

  if (!s?.mode) return;

  const text = ctx.message.text.trim();

  /* EMAIL */

  if (s.mode === "email") {

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
    ) {
      return ctx.reply(
        "❌ सही email डालो।\n\nExample:\naditya@gmail.com"
      );
    }

    const { error } =
      await supabase
        .from("users")
        .update({
          email: text
        })
        .eq("telegram_id", userId);

    clearSession(userId);

    if (error) {
      console.error(error);
      return ctx.reply(
        "❌ Email save नहीं हुआ।"
      );
    }

    return ctx.reply(
      "✅ Email successfully saved.",
      mainMenu(ctx)
    );
  }

  /* ADD PRODUCT - NAME */

  if (s.mode === "add_name") {

    s.product.name = text;
    s.mode = "add_description";

    return ctx.reply(
      "📝 Product description भेजो:"
    );
  }

  /* ADD PRODUCT - DESCRIPTION */

  if (s.mode === "add_description") {

    s.product.description = text;
    s.mode = "add_price";

    return ctx.reply(
      "💰 Product price भेजो:\n\nExample: 499"
    );
  }

  /* ADD PRODUCT - PRICE */

  if (s.mode === "add_price") {

    const price = Number(text);

    if (
      !Number.isFinite(price) ||
      price < 0
    ) {
      return ctx.reply(
        "❌ सही price डालो।"
      );
    }

    s.product.price = price;
    s.mode = "add_stock";

    return ctx.reply(
      "📦 Product stock भेजो:\n\nExample: 10"
    );
  }

  /* ADD PRODUCT - STOCK */

  if (s.mode === "add_stock") {

    const stock = Number(text);

    if (
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      return ctx.rep
