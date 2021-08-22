'use strict';

const {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand
} = require('@aws-sdk/client-sqs');
const sqs = new SQSClient({
  region: process.env.StackRegion,
  maxRetries: 3
});
const slack = require('./slack-alerts');

/**
 * Sends a message to the SQS queue
 * @param {object} event - Github webhook payload
 */
const sendSqsMsg = async (event) => {
  event.timestamp = new Date().toISOString();
  const params = {
    MessageAttributes: {
      Title: {
        DataType: 'String',
        StringValue: 'Github Webhook'
      },
      Author: {
        DataType: 'String',
        StringValue: 'redacted'
      }
    },
    MessageBody: JSON.stringify(event),
    QueueUrl: process.env.QueueUrl,
    MessageGroupId: 'redacted'
  };

  try {
    const response = await sqs.send(new SendMessageCommand(params));
    console.log('Success, message sent to queue: %s', response.MessageId);
  } catch (error) {
    const errMsg = `An error occurred sending a message to the SQS queue.`;
    console.log(`${errMsg}\n${error}`); // for troubleshooting
    await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}\n${error}`);
  }
};

/**
 * handler for GithubIngestion Lambda
 * @param {Object} event - Github App webhook payload
 */
exports.handler = async (event) => {
  console.log('Github webhook payload: ', event);
  console.log('Sending to queue.');
  await sendSqsMsg(event);
};

/**
 * Deletes a message from the queue
 * @param {string} receiptHandle - receipt handle of queue message to delete
 */
exports.deleteMessage = async (receiptHandle) => {
  const deleteParams = {
    QueueUrl: process.env.QueueUrl,
    ReceiptHandle: receiptHandle
  };

  try {
    const data = await sqs.send(new DeleteMessageCommand(deleteParams));
    console.log('Queue message deleted.', data);
  } catch (error) {
    const errMsg = `An error occurred deleting a message from the SQS queue.`;
    console.log(`${errMsg}\n${error}`); // for troubleshooting
    await slack.sendStackAlert(error, errMsg);
  }
};

/**
 * Receives queue messages and if successful then deletes the messages
 * NOTE: this function is not currently in use
 * @returns response data from receiveMessage or deleteMessage commands
 */
exports.receive = async () => {
  const params = {
    QueueUrl: process.env.QueueUrl,
    MaxNumberOfMessage: 1,
    MessageAttributeNames: ['All'],
    WaitTimeSeconds: 20,
    VisibilityTimeout: 10
  };

  try {
    const data = await sqs.send(new ReceiveMessageCommand(params));
    if (data.Messages) {
      const deleteParams = {
        QueueUrl: process.env.QueueUrl,
        ReceiptHandle: data.Messages[0].ReceiptHandle
      };
      try {
        const data = await sqs.send(new DeleteMessageCommand(deleteParams));
        console.log('Queue message deleted.', data);
      } catch (err) {
        console.log('Error deleting queue message.', err);
      }
    } else {
      console.log('No queue messages received.');
    }
    return data;
  } catch (err) {
    console.log('Queue receive Error.', err);
  }
};
