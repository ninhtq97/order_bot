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
  getData,
  getKeyboardPayeeMembers,
  updateData,
  toOrderKey,
  getName,
  getViewName,
} = require('./utils');
const CronJob = require('cron').CronJob;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.setMyCommands([
  {
    command: 'registerpayee',
    description: 'Thêm vào danh sách lựa chọn người lụm thóc',
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
    await updateData(FILE_PATHS.MEMBER, INIT_DATA.MEMBER);
  }

  try {
    await fs.access(FILE_PATHS.CONFIG, constants.R_OK);
  } catch (error) {
    await updateData(FILE_PATHS.CONFIG, INIT_DATA.CONFIG);
  }

  try {
    await fs.access(FILE_PATHS.ORDER, constants.R_OK);
  } catch (error) {
    await updateData(FILE_PATHS.ORDER, INIT_DATA.ORDER);
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
      name: getName(msg.from),
    });
    await updateData(FILE_PATHS.MEMBER, members);
    bot.sendMessage(
      msg.chat.id,
      `Đã thêm ${getViewName(msg.from)} vào danh sách`,
    );
  } else {
    bot.sendMessage(
      msg.chat.id,
      `${getViewName(msg.from)} đã có trong danh sách`,
    );
  }
});

bot.onText(KEY.ORDER, async (msg, match) => {
  const orders = await getData(FILE_PATHS.ORDER);

  orders[toOrderKey(msg.from.id)] = {
    name: getName(msg.from),
    text: match[2],
    paid: false,
    received: false,
  };

  await updateData(FILE_PATHS.ORDER, orders);
});

bot.onText(KEY.ORDER_LIST, async (msg) => {
  const orders = await getData(FILE_PATHS.ORDER);
  const orderOwners = Object.keys(orders);

  if (orderOwners.length) {
    let message = '';
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
//       `Danh sách trả thóc ngày ${format(new Date(), 'dd-MM-yyyy')}`,
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
      `Thiết lập người lụm thóc.\nDanh sách thành viên:`,
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
  console.log('Edit Message:', query);

  if (new RegExp(KEY.ORDER).test(query.text)) {
    const text = query.text.replace(REGEXP_REPLACE.ORDER, ' ').trim();
    const orders = await getData(FILE_PATHS.ORDER);

    orders[toOrderKey(query.from.id)] = orders[toOrderKey(query.from.id)] || {};
    orders[toOrderKey(query.from.id)].text = text;
    orders[toOrderKey(query.from.id)].name = getName(query.from);

    await updateData(FILE_PATHS.ORDER, orders);
  }
});

bot.on('callback_query', async (query) => {
  console.log('Query:', query);

  if (new RegExp(REGEX_CALLBACK.PAID).test(query.data)) {
    const config = await getData(FILE_PATHS.CONFIG);
    const userPaid = query.data.replace(REGEXP_REPLACE.PAID, ' ').trim();
    const isOwner =
      toOrderKey(query.from.id) === userPaid ||
      query.from.id === config.payee.id;

    if (isOwner) {
      const orders = await getData(FILE_PATHS.ORDER);
      orders[userPaid].paid = !orders[userPaid].paid;

      const resUpdate = await updateData(FILE_PATHS.ORDER, orders);
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
      bot.sendChatAction(query.message.chat.id, 'typing');
      bot.sendMessage(
        query.message.chat.id,
        `Lêu lêu <b>${getViewName(
          query.from,
        )}</b>. Đừng spam bot, bot tức là không cho order nhá 😜😜😜`,
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
      orders[userPaid].paid = orders[userPaid].received;

      const resUpdate = await updateData(FILE_PATHS.ORDER, orders);
      if (resUpdate) {
        const replyMarkup = query.message.reply_markup.inline_keyboard.map(
          (e) =>
            e.map((x) =>
              x.callback_data === query.data
                ? {
                    ...x,
                    text: `Đã nhận ${orders[userPaid].received ? '✅' : '❌'} `,
                  }
                : new RegExp(REGEXP_REPLACE.PAID).test(x.callback_data)
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
      bot.sendChatAction(query.message.chat.id, 'typing');
      bot.sendMessage(
        query.message.chat.id,
        `Lêu lêu <b>${getViewName(
          query.from,
        )}</b>. Bạn không phải người lụm thóc 🤪🤪🤪`,
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
      await updateData(FILE_PATHS.CONFIG, config);

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

    const payeeImages = {};

    try {
      const qrBankPath = `${DIR_PATHS.IMAGES}/${config.payee.id}_bank.jpg`;
      await fs.access(qrBankPath, constants.R_OK);
      payeeImages['BANK'] = qrBankPath;
    } catch (error) {}

    try {
      const qrMomoPath = `${DIR_PATHS.IMAGES}/${config.payee.id}_momo.jpg`;
      await fs.access(qrMomoPath, constants.R_OK);
      payeeImages['MOMO'] = qrMomoPath;
    } catch (error) {}

    bot.sendChatAction(GROUP_ORDER_ID, 'typing');

    if (inlineKeyboard) {
      if (Object.values(payeeImages).length) {
        bot.sendMediaGroup(
          GROUP_ORDER_ID,
          Object.values(payeeImages).map((e) => ({ type: 'photo', media: e })),
        );
      }

      bot.sendMessage(
        GROUP_ORDER_ID,
        `Đến h lụm thóc ngày (${format(new Date(), 'dd-MM-yyyy')}) 🐹🐹🐹`,
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
      orders[owner].paid && orders[owner].received && delete orders[owner];
    }

    const inlineKeyboard = await getKeyboardOrders(orders);

    if (inlineKeyboard) {
      bot.sendMessage(
        GROUP_ORDER_ID,
        `Cuối ngày rồi, đừng quên trả thóc ngày (${format(
          new Date(),
          'dd-MM-yyyy',
        )}) nhé 🐹🐹🐹`,
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

jobReAnnouncePayment.start();

const jobClean = new CronJob(
  '0 0 * * *',
  async function () {
    await updateData(FILE_PATHS.ORDER, INIT_DATA.ORDER);
  },
  null,
  true,
  'Asia/Ho_Chi_Minh',
);

jobClean.start();
