'use strict';

const { IncomingWebhook } = require('@slack/webhook');
const sm = require('./secrets');

/**
 *
 * @param {Object} err - error returned by calling function
 * @param {String} errMsg - informational message to include in Slack alert
 */
module.exports.sendStackAlert = async (err, errMsg) => {
  const alertBody = {
    text: `There has been a '${
      process.env.GithubEventFuncName
    }' Lambda function error. \nError: ${errMsg} \n${JSON.stringify(
      err.errorMessage
    )} \n<${process.env.GithubEventLogUrl}|See logs> for details.`
  };
  try {
    const slackUrl = await sm.getSecret(process.env.SlackWebhookUrl);
    const webhook = new IncomingWebhook(slackUrl);
    const response = await webhook.send(alertBody);
    console.log(`Stack alert sent to Slack: ${JSON.stringify(response)}`);
  } catch (error) {
    throw new Error(`Error sending stack alert to Slack: ${error}`);
    // TODO: page IT Dev service if Slack alert is not sent on stack error
  }
};
