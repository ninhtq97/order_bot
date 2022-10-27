const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const token = '5432749925:AAGEsaMq4FiYGpMdIQFeSxF9VhH-E2zyaVk';

const bot = new TelegramBot(token, { polling: true });

bot.setMyCommands([
  { command: 'start', description: 'start' },
  { command: 'weather', description: 'weather' },
  { command: 'sticker', description: 'sticker' },
  { command: 'location', description: 'location' },
  { command: 'music', description: 'music' },
  { command: 'film', description: 'film' },
]);

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Welcome !!!');
});

bot.onText(/\/weather/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Get weather');
});

bot.onText(/\/sticker/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Get sticker');
});

bot.onText(/\/location/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Send location');
});

bot.onText(/\/music/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Play music');
});

bot.onText(/\/film/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Get link film');
});

bot.on('message', (msg) => {
  bot.sendChatAction(msg.chat.id, 'typing');
});
