const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs/promises');
const { constants } = require('fs');
const { format } = require('date-fns');
const {
  KEY,
  BOT_TOKEN,
  GROUP_ORDER_ID,
  FILE_PATHS,
  INIT_DATA,
  REGEXP_REPLACE,
  REGEX_CALLBACK,
  DIR_PATHS,
} = require('./constants');
const {
  getKeyboardOrders,
  updateOrders,
  getData,
  getKeyboardPayeeMembers,
} = require('./utils');
const CronJob = require('cron').CronJob;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.setMyCommands([
  {
    command: 'registerpayee',
    description: 'Thêm vào danh sách lựa chọn người thu tiền',
  },
  {
    command: 'order',
    description: 'Đặt món theo cú pháp: /order {text}',
  },
  {
    command: 'orderlist',
    description: 'Danh sách đặt cơm',
  },
]);

(async () => {
  await fs.mkdir(DIR_PATHS.DATA, { recursive: true });

  try {
    await fs.access(FILE_PATHS.MEMBER, constants.R_OK);
  } catch (error) {
    await fs.writeFile(FILE_PATHS.MEMBER, JSON.stringify(INIT_DATA.MEMBER));
  }

  try {
    await fs.access(FILE_PATHS.CONFIG, constants.R_OK);
  } catch (error) {
    await fs.writeFile(
      FILE_PATHS.CONFIG,
      JSON.stringify(INIT_DATA.CONFIG, null, 2),
    );
  }

  try {
    await fs.access(FILE_PATHS.ORDER, constants.R_OK);
  } catch (error) {
    await fs.writeFile(FILE_PATHS.ORDER, JSON.stringify(INIT_DATA.ORDER));
  }
})();

bot.on('message', (msg) => {
  console.log('Message:', msg);
});

bot.onText(KEY.REGISTER_PAYEE, async (msg) => {
  const members = await getData(FILE_PATHS.MEMBER);
  const member = members.find((x) => x.id === msg.from.id);

  bot.sendChatAction(msg.chat.id, 'typing');
  if (!member) {
    members.push({
      id: msg.from.id,
      name:
        msg.from.username ||
        `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim(),
    });
    await fs.writeFile(FILE_PATHS.MEMBER, JSON.stringify(members, null, 2));
    bot.sendMessage(
      msg.chat.id,
      `Đã thêm ${
        `@${msg.from.username}` ||
        `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim()
      } vào danh sách`,
    );
  } else {
    bot.sendMessage(
      msg.chat.id,
      `${
        `@${msg.from.username}` ||
        `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim()
      } đã có trong danh sách`,
    );
  }
});

bot.onText(KEY.ORDER, async (msg, match) => {
  const jsonFile = await fs.readFile(FILE_PATHS.ORDER, { encoding: 'utf8' });

  const data = JSON.parse(jsonFile);
  data[msg.from.id] = {
    name:
      msg.from.username ||
      `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim(),
    text: match[2],
    paid: false,
    received: false,
  };

  await fs.writeFile(FILE_PATHS.ORDER, JSON.stringify(data, null, 2));
});

bot.onText(KEY.ORDER_LIST, async (msg) => {
  const orders = await getData(FILE_PATHS.ORDER);
  const orderOwners = Object.keys(orders);

  let message = '';
  if (orderOwners.length) {
    for (const [i, o] of orderOwners.entries()) {
      message = message.concat(
        `${i + 1}. ${orders[o].name}: ${orders[o].text}${
          i < orderOwners.length ? '\n' : ''
        }`,
      );
    }

    bot.sendChatAction(msg.chat.id, 'typing');
    bot.sendMessage(msg.chat.id, message);
  }
});

// bot.onText(KEY.PAY_LIST, async (msg) => {
//   const inlineKeyboard = await getKeyboardOrders();

//   if (inlineKeyboard) {
//     bot.sendChatAction(msg.chat.id, 'typing');
//     bot.sendMessage(
//       msg.chat.id,
//       `Danh sách thanh toán tiền cơm ngày ${format(new Date(), 'dd-MM-yyyy')}`,
//       {
//         reply_markup: {
//           resize_keyboard: true,
//           inline_keyboard: inlineKeyboard,
//         },
//       },
//     );
//   }
// });

bot.onText(KEY.SET_PAYEE, async (msg) => {
  const inlineKeyboard = await getKeyboardPayeeMembers();

  if (inlineKeyboard) {
    bot.sendChatAction(msg.chat.id, 'typing');
    bot.sendMessage(
      msg.chat.id,
      `Thiết lập người nhận tiền.\nDanh sách thành viên:`,
      {
        reply_markup: {
          resize_keyboard: true,
          inline_keyboard: inlineKeyboard,
        },
      },
    );
  }
});

bot.on('edited_message', async (query) => {
  if (new RegExp(KEY.ORDER).test(query.text)) {
    const text = query.text.replace(REGEXP_REPLACE.ORDER, ' ').trim();

    const orders = await getData(FILE_PATHS.ORDER);

    orders[query.from.id].text = text;
    orders[query.from.id].name =
      query.from.username ||
      `${query.from.first_name || ''} ${query.from.last_name || ''}`.trim();

    await fs.writeFile(FILE_PATHS.ORDER, JSON.stringify(orders, null, 2));
  }
});

bot.on('callback_query', async (query) => {
  console.log('Query:', query);

  if (new RegExp(REGEX_CALLBACK.PAID).test(query.data)) {
    const config = await getData(FILE_PATHS.CONFIG);
    const userPaid = query.data.replace(REGEXP_REPLACE.PAID, ' ').trim();
    const isOwner =
      query.from.id === +userPaid || query.from.id === config.payee.id;

    bot.sendChatAction(query.message.chat.id, 'typing');
    if (isOwner) {
      const orders = await getData(FILE_PATHS.ORDER);
      orders[userPaid].paid = !orders[userPaid].paid;

      const resUpdate = await updateOrders(orders);
      if (resUpdate) {
        const replyMarkup = query.message.reply_markup.inline_keyboard.map(
          (e) =>
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
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
          },
        );
      }
    } else {
      bot.sendMessage(
        query.message.chat.id,
        `Lêu lêu <b>${
          `@${query.from.username}` ||
          `${query.from.first_name} ${query.from.last_name}`
        }</b>. Đừng spam bot, bot tức là không cho order nhá 😜😜😜`,
        {
          parse_mode: 'HTML',
        },
      );
    }
  }

  if (new RegExp(REGEX_CALLBACK.RECEIVED).test(query.data)) {
    const config = await getData(FILE_PATHS.CONFIG);

    if (query.from.id === config.payee.id) {
      const userPaid = query.data.replace(REGEXP_REPLACE.RECEIVED, ' ').trim();

      const orders = await getData(FILE_PATHS.ORDER);
      orders[userPaid].received = !orders[userPaid].received;

      const resUpdate = await updateOrders(orders);
      if (resUpdate) {
        const replyMarkup = query.message.reply_markup.inline_keyboard.map(
          (e) =>
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
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
          },
        );
      }
    } else {
      bot.sendMessage(
        query.message.chat.id,
        `Lêu lêu <b>${
          `@${query.from.username}` ||
          `${query.from.first_name} ${query.from.last_name}`
        }</b>. Bạn không phải người thu tiền 🤪🤪🤪`,
        {
          parse_mode: 'HTML',
        },
      );
    }
  }

  if (new RegExp(REGEX_CALLBACK.SET_PAYEE).test(query.data)) {
    const members = await getData(FILE_PATHS.MEMBER);
    const config = await getData(FILE_PATHS.CONFIG);

    const payeeId = query.data.replace(REGEXP_REPLACE.SET_PAYEE, ' ').trim();
    const member = members.find((x) => x.id === +payeeId);

    if (config.payee.id !== member.id) {
      config.payee = member;
      await fs.writeFile(FILE_PATHS.CONFIG, JSON.stringify(config, null, 2));

      const replyMarkup = query.message.reply_markup.inline_keyboard.map((e) =>
        e.map((x) =>
          x.callback_data === query.data
            ? {
                ...x,
                text: `${member.name} ${
                  new RegExp(config.payee.name).test(x.text.trim()) ? '✅' : ''
                }`,
              }
            : { ...x, text: x.text.split(' ')[0] },
        ),
      );

      bot.editMessageReplyMarkup(
        { inline_keyboard: replyMarkup },
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
        },
      );
    }
  }
});

const jobAnnouncePayment = new CronJob(
  '0 15 * * 1-5',
  async function () {
    const config = await getData(FILE_PATHS.CONFIG);
    const inlineKeyboard = await getKeyboardOrders();

    const existPayeeImages = { BANK: false, MOMO: false };
    const payeeImages = {
      BANK: `${DIR_PATHS.IMAGES}/${config.payee.id}_bank.jpg`,
      MOMO: `${DIR_PATHS.IMAGES}/${config.payee.id}_momo.jpg`,
    };

    try {
      await fs.access(payeeImages.BANK, constants.R_OK);
      existPayeeImages['BANK'] = true;
    } catch (error) {}

    try {
      await fs.access(payeeImages.MOMO, constants.R_OK);
      existPayeeImages['MOMO'] = true;
    } catch (error) {}

    const isPayee = existPayeeImages['BANK'] && existPayeeImages['MOMO'];

    bot.sendChatAction(GROUP_ORDER_ID, 'typing');
    if (isPayee) {
      bot.sendMediaGroup(
        GROUP_ORDER_ID,
        Object.values(payeeImages).map((e) => ({ type: 'photo', media: e })),
      );
    }

    if (inlineKeyboard) {
      bot.sendMessage(
        GROUP_ORDER_ID,
        `Lệ quyên lệ quyên mn ơi (${format(new Date(), 'dd-MM-yyyy')}) 💸💸💸`,
        {
          reply_markup: {
            resize_keyboard: true,
            inline_keyboard: inlineKeyboard,
          },
        },
      );
    }
  },
  null,
  true,
  'Asia/Ho_Chi_Minh',
);

jobAnnouncePayment.start();

const jobReAnnouncePayment = new CronJob(
  '0 17 * * 1-5',
  async function () {
    const orders = await getData(FILE_PATHS.ORDER);

    for (const owner in orders) {
      orders[owner].paid && delete orders[owner];
    }

    const inlineKeyboard = await getKeyboardOrders(orders);

    bot.sendMessage(
      GROUP_ORDER_ID,
      `Cuối ngày rồi, đừng quên trả tiền cơm ngày (${format(
        new Date(),
        'dd-MM-yyyy',
      )}) nhé 💸💸💸`,
      {
        reply_markup: {
          resize_keyboard: true,
          inline_keyboard: inlineKeyboard,
        },
      },
    );
  },
  null,
  true,
  'Asia/Ho_Chi_Minh',
);

jobReAnnouncePayment.start();

const jobClean = new CronJob(
  '0 0 * * *',
  async function () {
    await fs.writeFile(FILE_PATHS.ORDER, JSON.stringify(INIT_DATA.ORDER));
  },
  null,
  true,
  'Asia/Ho_Chi_Minh',
);

jobClean.start();
