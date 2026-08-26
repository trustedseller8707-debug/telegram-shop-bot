import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply(
    "🛍️ Welcome to Trusted Seller Shop!\n\n" +
    "Bot successfully connected ✅"
  );
});

bot.command("menu", (ctx) => {
  ctx.reply(
    "🛍️ SHOP MENU\n\n" +
    "📦 Products\n" +
    "📋 My Orders\n" +
    "👤 My Account\n" +
    "📞 Support"
  );
});

bot.launch();

console.log("Telegram bot is running...");
