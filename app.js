const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs/promises');
const { constants } = require('fs');
const { format, isEqual, startOfDay } = require('date-fns');
const {
  KEY,
  BOT_TOKEN,
  GROUP_ID,
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
  findOrderKey,
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
  {
    command: 'cancel',
    description: 'Huỷ đặt cơm',
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

  const deletedKeys = Object.keys(orders).filter((k) =>
    k.includes(findOrderKey(msg.from.id)),
  );
  if (deletedKeys.length) {
    for (const old of deletedKeys) {
      delete orders[old];
    }
  }

  const newOrders = match.input
    .split(new RegExp(KEY.GET_ORDER))
    .filter((o) => !!o);
  for (const order of newOrders) {
    orders[toOrderKey(msg.from.id)] = {
      name: getName(msg.from),
      text: order.trim(),
      paid: false,
      received: false,
    };
  }

  await updateData(FILE_PATHS.ORDER, orders);
});

bot.onText(KEY.CANCEL, async (msg, match) => {
  const orders = await getData(FILE_PATHS.ORDER);

  const deletedKeys = Object.keys(orders).filter((k) =>
    k.includes(findOrderKey(msg.from.id)),
  );

  if (deletedKeys.length) {
    for (const old of deletedKeys) {
      delete orders[old];
    }
  } else {
    return;
  }

  await updateData(FILE_PATHS.ORDER, orders);

  bot.sendChatAction(GROUP_ID, 'typing');
  bot.sendMessage(
    GROUP_ID,
    `<b>${getName(msg.from)}</b>, mời nộp 5 chục để huỷ đặt cơm 🤪🤪🤪`,
    // Phím sa, gà đã luộc :):)
    {
      parse_mode: 'HTML',
    },
  );
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
    const orders = await getData(FILE_PATHS.ORDER);
    //const text = query.text.replace(REGEXP_REPLACE.ORDER, ' ').trim();

    // orders[toOrderKey(query.from.id)] = orders[toOrderKey(query.from.id)] || {};
    // orders[toOrderKey(query.from.id)].text = text;
    // orders[toOrderKey(query.from.id)].name = getName(query.from);

    const text = query.text.trim();
    const keys = Object.keys(orders).filter((k) =>
      k.includes(findOrderKey(query.from.id)),
    );
    let stt = 0;
    const newOrders = text.split(new RegExp(KEY.GET_ORDER)).filter((o) => !!o);

    if (newOrders.length != keys.length) {
      //get new identity number
      for (const old of keys) {
        delete orders[old];
      }

      for (const order of newOrders) {
        orders[toOrderKey(query.from.id)] = {
          name: getName(query.from),
          text: order.trim(),
          paid: false,
          received: false,
        };
      }
    } else {
      //edit ordered items
      for (const order of newOrders) {
        orders[keys[stt]] = {
          name: getName(query.from),
          text: order.trim(),
          paid: false,
          received: false,
        };
        stt++;
      }
    }

    await updateData(FILE_PATHS.ORDER, orders);
  }
});

bot.on('callback_query', async (query) => {
  console.log('Query:', query);

  if (new RegExp(REGEX_CALLBACK.PAID).test(query.data)) {
    const config = await getData(FILE_PATHS.CONFIG);
    const userPaid = query.data.replace(REGEXP_REPLACE.PAID, ' ').trim();
    const isOwner =
      userPaid.includes(query.from.id) || query.from.id === config.payee.id;

    if (isOwner) {
      const orders = await getData(FILE_PATHS.ORDER);

      if (Object.keys(orders).length) {
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
    const userPaid = query.data.replace(REGEXP_REPLACE.RECEIVED, ' ').trim();

    if (query.from.id === config.payee.id) {
      let replyMarkup = null;
      let isUpdated = true;
      if (
        !isEqual(
          startOfDay(new Date(query.message.date * 1000)),
          startOfDay(new Date()),
        )
      ) {
        const oldContent = JSON.stringify(
          query.message.reply_markup.inline_keyboard,
        );
        replyMarkup = query.message.reply_markup.inline_keyboard.map((e) =>
          e.map((x) =>
            x.callback_data === query.data
              ? {
                  ...x,
                  text: `Đã nhận ✅ `,
                }
              : new RegExp(`paid ${userPaid}`).test(x.callback_data)
              ? {
                  ...x,
                  text: `Đã gửi ✅ `,
                }
              : x,
          ),
        );
        const newContent = JSON.stringify(replyMarkup);
        if (oldContent === newContent) isUpdated = false;
      } else {
        const orders = await getData(FILE_PATHS.ORDER);
        if (Object.keys(orders).length) {
          orders[userPaid].received = !orders[userPaid].received;
          orders[userPaid].paid = orders[userPaid].received;

          const resUpdate = await updateData(FILE_PATHS.ORDER, orders);
          if (resUpdate) {
            replyMarkup = query.message.reply_markup.inline_keyboard.map((e) =>
              e.map((x) =>
                x.callback_data === query.data
                  ? {
                      ...x,
                      text: `Đã nhận ${
                        orders[userPaid].received ? '✅' : '❌'
                      } `,
                    }
                  : new RegExp(`paid ${userPaid}`).test(x.callback_data)
                  ? {
                      ...x,
                      text: `Đã gửi ${orders[userPaid].paid ? '✅' : '❌'} `,
                    }
                  : x,
              ),
            );
          }
        }
      }

      if (replyMarkup && isUpdated) {
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

const jobOrder = new CronJob(
  '30 10 * * 1-5',
  async () => {
    bot.sendChatAction(GROUP_ID, 'typing');
    bot.sendMessage(GROUP_ID, `Nhắc nhẹ: Order cơm thôi kẻo đói mn ơi 🍚🍚🍚`);
    bot.sendMessage(GROUP_ID, 'https://t.me/datcomt12/2521');
  },
  null,
  true,
  'Asia/Ho_Chi_Minh',
);

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

    bot.sendChatAction(GROUP_ID, 'typing');

    if (inlineKeyboard) {
      if (Object.values(payeeImages).length) {
        bot.sendMediaGroup(
          GROUP_ID,
          Object.values(payeeImages).map((e) => ({ type: 'photo', media: e })),
        );
      }

      bot.sendMessage(
        GROUP_ID,
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
        GROUP_ID,
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

const jobClean = new CronJob(
  '0 0 * * *',
  async function () {
    await updateData(FILE_PATHS.ORDER, INIT_DATA.ORDER);
  },
  null,
  true,
  'Asia/Ho_Chi_Minh',
);
