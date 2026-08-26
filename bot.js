import { Telegraf } from "telegraf";
import http from "http";

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

const PORT = process.env.PORT || 10000;

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Telegram Shop Bot is running");
}).listen(PORT, "0.0.0.0", () => {
  console.log(`Web server running on port ${PORT}`);
});

bot.launch();

console.log("Telegram bot is running...");
