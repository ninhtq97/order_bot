exports.REGEX_CALLBACK = {
  PAID: /paid (.*)/,
  RECEIVED: /received (.*)/,
  SET_PAYEE: /setpayee (.+)/,
};

exports.REGEXP_REPLACE = {
  ORDER: /(\/order |\/order@(.+?) )/,
  PAID: /paid/,
  RECEIVED: /received/,
  SET_PAYEE: /setpayee/,
};

exports.KEY = {
  ORDER: /((\/order@(.+?)|\/order) (.+))/,
  ORDER_LIST: /\/orderlist/,
  PAY_LIST: /\/paylist/,
  REGISTER_PAYEE: /\/registerpayee/,
  SET_PAYEE: /\/setpayee/,
};

exports.GROUP_ORDER_ID = -1001627110278;
exports.BOT_TOKEN = '5716072961:AAGwX7iqdX-o_BIrZCK4J_qmiQipx2CtA50';

exports.DIR_PATHS = {
  DATA: './data',
  ASSETS: './assets',
  IMAGES: './assets/images',
};

exports.FILE_PATHS = {
  MEMBER: `${this.DIR_PATHS.DATA}/member.json`,
  CONFIG: `${this.DIR_PATHS.DATA}/config.json`,
  ORDER: `${this.DIR_PATHS.DATA}/order.json`,
};

exports.INIT_DATA = {
  MEMBER: [],
  CONFIG: { payee: { id: 0, name: '' } },
  ORDER: {},
};
