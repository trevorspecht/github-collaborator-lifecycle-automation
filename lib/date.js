'use strict';

/**
 * @param {String} time - ISO date from event webhook
 * @returns event date plus one year
 * yyyy-mm-dd formatted
 */
exports.expDateOneYear = async (eventTime) => {
  let time = new Date(eventTime);
  time.setDate(time.getDate());
  time = time.toISOString();
  const yyyy = /.{4}/;
  const mm = /(?<=-)../;
  const dd = /(?<=-..-)../;
  let year = yyyy.exec(time);
  const month = mm.exec(time);
  const day = dd.exec(time);
  year++;
  const formatted = `${year}-${month}-${day}`;
  return formatted;
};

/**
 * @param {String} time - ISO date from event webhook
 * @returns event date plus one week
 * yyyy-mm-dd formatted
 */
exports.expDateOneWeek = async (eventTime) => {
  let time = new Date(eventTime);
  time.setDate(time.getDate() + 7);
  time = time.toISOString();
  const yyyy = /.{4}/;
  const mm = /(?<=-)../;
  const dd = /(?<=-..-)../;
  const year = yyyy.exec(time);
  const month = mm.exec(time);
  const day = dd.exec(time);
  const formatted = `${year}-${month}-${day}`;
  return formatted;
};

/**
 * @param {String} time - ISO date from event webhook
 * @returns event date
 * yyyy-mm-dd formatted
 */
exports.expDateToday = async (eventTime) => {
  let time = new Date(eventTime);
  time.setDate(time.getDate());
  time = time.toISOString();
  const yyyy = /.{4}/;
  const mm = /(?<=-)../;
  const dd = /(?<=-..-)../;
  const year = yyyy.exec(time);
  const month = mm.exec(time);
  const day = dd.exec(time);
  const formatted = `${year}-${month}-${day}`;
  return formatted;
};

/**
 * @param {string} yyyymmdd - date in yyyy-mm-dd format
 * converts yyyy-mm-dd date into Unix time
 */
const unixTime = async (yyyymmdd) => {
  // extract year, month and day with regex
  const yyyy = /.{4}/;
  const mm = /(?<=-)../;
  const dd = /(?<=-..-)../;
  const year = yyyy.exec(yyyymmdd);
  const month = mm.exec(yyyymmdd);
  const day = dd.exec(yyyymmdd);
  // create Date object and set date
  const date = new Date();
  date.setFullYear(year[0]);
  date.setMonth(month[0] - 1);
  date.setDate(day[0]);
  // convert date to Unix time
  return date.getTime();
};

/**
 * @param {string} expDate - date in yyyy-mm-dd format
 * determines if collab account expiration notification is needed
 * returns true if:
 * - current date is not after expDate
 * - current date is 21 days earlier than expDate
 * - current date is seven days earlier than expDate
 * - current date is three days earlier than expDate
 */
exports.expNotify = async (expDate) => {
  const now = Date.now();
  const oneDay = 86400000; // one day in milliseconds

  const expDateUnix = await unixTime(expDate);

  const expDateDiff = expDateUnix - now;

  if (expDateDiff <= 0) {
    return false;
  } else if (expDateDiff <= oneDay * 21 && expDateDiff > oneDay * 20) {
    return true;
  } else if (expDateDiff <= oneDay * 7 && expDateDiff > oneDay * 6) {
    return true;
  } else if (expDateDiff <= oneDay * 3 && expDateDiff > oneDay * 2) {
    return true;
  } else return false;
};
