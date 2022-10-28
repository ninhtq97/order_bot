const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs/promises');
const { constants } = require('fs/promises');
const { format } = require('date-fns');
const CronJob = require('cron').CronJob;

const group_t12_id = -886441272;
const token = '5716072961:AAGwX7iqdX-o_BIrZCK4J_qmiQipx2CtA50';

const bot = new TelegramBot(token, { polling: true });

bot.setMyCommands([
  // { command: 'weather', description: 'weather' },
  // { command: 'sticker', description: 'sticker' },
  // { command: 'location', description: 'location' },
  // { command: 'music', description: 'music' },
  // { command: 'film', description: 'film' },
  {
    command: 'order',
    description: 'Đặt món theo cú pháp: /order {text}',
  },
  {
    command: 'paylist',
    description: 'Danh sách thanh toán tiền cơm',
  },
]);

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Welcome !!!');
});

// bot.onText(/\/weather/, (msg) => {
//   bot.sendMessage(msg.chat.id, 'Get weather');
// });

// bot.onText(/\/sticker/, (msg) => {
//   bot.sendMessage(msg.chat.id, 'Get sticker');
// });

// bot.onText(/\/location/, (msg) => {
//   bot.sendMessage(msg.chat.id, 'Send location');
// });

// bot.onText(/\/music/, (msg) => {
//   bot.sendMessage(msg.chat.id, 'Play music');
// });

// bot.onText(/\/film/, (msg) => {
//   bot.sendMessage(msg.chat.id, 'Get link film');
// });

const orderMealFilePath = './order-meal.json';
const emptyOrder = {};

try {
  fs.access(orderMealFilePath, constants.R_OK);
} catch (error) {
  fs.writeFile(orderMealFilePath, JSON.stringify(emptyOrder), (err) => {
    if (err) throw err;
    console.log('Data written to file');
  });
}

bot.onText(/[\/order@t12_order_bot | \/order]+ (.+)/, async (msg, match) => {
  const dish = {
    author: msg.from.username || `${msg.from.first_name} ${msg.from.last_name}`,
    text: match[1],
  };

  const jsonFile = await fs.readFile(orderMealFilePath, { encoding: 'utf8' });

  const data = JSON.parse(jsonFile);
  data[dish.author] = { text: dish.text, paid: false };

  await fs.writeFile(orderMealFilePath, JSON.stringify(data, null, 2));
});

bot.onText(/\/orderdone/, async (msg) => {
  const data = await fs.readFile(orderMealFilePath);
  const orders = JSON.parse(data);
  const orderKeys = Object.keys(orders);

  let message = '';
  if (orderKeys.length) {
    for (const [i, o] of orderKeys.entries()) {
      message = message.concat(
        `${i + 1}. ${o}: ${orders[o].text}${i < orderKeys.length ? '\n' : ''}`,
      );
    }

    bot.sendChatAction(msg.chat.id, 'typing');
    bot.sendMessage(msg.chat.id, message);
  }
});

bot.onText(/\/paylist/, async (msg) => {
  const data = await fs.readFile(orderMealFilePath);
  const orders = JSON.parse(data);
  const orderKeys = Object.keys(orders);

  if (orderKeys.length) {
    bot.sendChatAction(msg.chat.id, 'typing');
    bot.sendMessage(
      msg.chat.id,
      `Danh sách thanh toán tiền cơm ngày ${format(new Date(), 'dd-MM-yyyy')}`,
      {
        reply_markup: {
          resize_keyboard: true,
          inline_keyboard: [
            ...orderKeys.map((key) => {
              const order = orders[key];

              return [
                {
                  text: key,
                  callback_data: 'username',
                },
                {
                  text: `Đã gửi ${order.paid ? '✅' : '❌'}`,
                  callback_data: `paid ${key}`,
                },
                {
                  text: `Đã nhận ${order.received ? '✅' : '❌'}`,
                  callback_data: `received ${key}`,
                },
              ];
            }),
          ],
        },
      },
    );
  }
});

bot.on('edited_message', async (query) => {
  if (new RegExp(/[\/order@t12_order_bot | \/order]+ (.+)/)) {
    const text = query.text
      .replace(/[\/order@t12_order_bot | \/order]+/i, ' ')
      .trim();

    const data = await fs.readFile(orderMealFilePath);
    const orders = JSON.parse(data);

    orders[
      query.from.username || `${query.from.first_name} ${query.from.last_name}`
    ].text = text;

    await fs.writeFile(orderMealFilePath, JSON.stringify(orders, null, 2));
  }
});

bot.on('callback_query', async (query) => {
  if (new RegExp(/paid (.*)/).test(query.data)) {
    const splitData = query.data.split(' ');

    const userPaid = splitData[1];

    const data = await fs.readFile(orderMealFilePath);

    const orders = JSON.parse(data);

    orders[userPaid].paid = !orders[userPaid].paid;

    await fs.writeFile(orderMealFilePath, JSON.stringify(orders, null, 2));

    const replyMarkup = query.message.reply_markup.inline_keyboard.map((e) =>
      e.map((x) =>
        x.callback_data === query.data
          ? {
              ...x,
              text: `Đã gửi ${orders[userPaid].paid ? '✅' : '❌'} `,
            }
          : x,
      ),
    );

    bot.editMessageReplyMarkup(
      { inline_keyboard: replyMarkup },
      { chat_id: query.message.chat.id, message_id: query.message.message_id },
    );
  }

  if (new RegExp(/received (.*)/).test(query.data)) {
    const splitData = query.data.split(' ');
    const userPaid = splitData[1];
    const data = await fs.readFile(orderMealFilePath);

    const orders = JSON.parse(data);

    orders[userPaid].received = !orders[userPaid].received;

    await fs.writeFile(orderMealFilePath, JSON.stringify(orders, null, 2));

    const replyMarkup = query.message.reply_markup.inline_keyboard.map((e) =>
      e.map((x) =>
        x.callback_data === query.data
          ? {
              ...x,
              text: `Đã nhận ${orders[userPaid].received ? '✅' : '❌'} `,
            }
          : x,
      ),
    );

    bot.editMessageReplyMarkup(
      { inline_keyboard: replyMarkup },
      { chat_id: query.message.chat.id, message_id: query.message.message_id },
    );
  }
});

// bot.on('message', (msg) => {
//   console.log('Message:', msg);
// });

const jobRemind = new CronJob(
  '0 15 * * 1-5',
  function () {
    bot.sendChatAction(group_t12_id, 'typing');
    bot.sendMessage(group_t12_id, 'Lệ quyên lệ quyên mn ơi 💸💸💸');
  },
  null,
  true,
  'Asia/Ho_Chi_Minh',
);

jobRemind.start();

const jobClean = new CronJob(
  '0 0 * * *',
  async function () {
    await fs.writeFile(orderMealFilePath, JSON.stringify(emptyOrder));
  },
  null,
  true,
  'Asia/Ho_Chi_Minh',
);

jobClean.start();
