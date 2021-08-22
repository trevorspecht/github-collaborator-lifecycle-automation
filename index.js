'use strict';

const spoke = require('./lib/spoke');
const identity = require('./lib/identity');
const queue = require('./lib/queue');
const slack = require('./lib/slack-alerts');

exports.handler = async (event) => {
  console.log('Queue message from ingestion lambdas: ', event);

  try {
    const body = JSON.parse(event.Records[0].body);
    const receiptHandle = event.Records[0].receiptHandle;

    // filter for non-collaborator events
    if (body.repositories_added) {
      for (const repo of body.repositories_added) {
        console.log(
          'Non-collaborator event: repository added: ',
          repo.full_name
        );
      }
      return;
    }
    if (body.repositories_removed) {
      for (const repo of body.repositories_removed) {
        console.log(
          'Non-collaborator event: repository removed: ',
          repo.full_name
        );
      }
      return;
    }

    const ghOrg = body.organization.login;
    const ghHandle = body.member.login;
    const collabAccessGrantedTagId = 'xxxxxxx';
    const collabAccessRemovedTagId = 'xxxxxxx';

    let tagIdToAdd = collabAccessGrantedTagId;
    let tagIdToRemove = collabAccessRemovedTagId;
    if (body.action === 'removed') {
      tagIdToAdd = collabAccessRemovedTagId;
      tagIdToRemove = collabAccessGrantedTagId;
    }
    const tagParams = {
      tags: [
        {
          _id: tagIdToAdd
        }
      ]
    };

    console.log('Github org: %s', ghOrg);

    console.log('Checking if collab is a Mapbox employee.');
    const apiIdentityResponse = await identity.getMapboxUser(ghHandle);
    console.log('Response from api-identity: ', apiIdentityResponse);

    // proceed or exit depending on Mapbox org membership
    const handlerResponse = await identity.orgMembershipHandler(
      apiIdentityResponse,
      ghHandle
    );
    if (handlerResponse) return;

    console.log('Searching tickets in queue for collab github handle.');
    const ghRequest = await spoke.findByGithubHandle(ghHandle);

    if (!ghRequest) {
      console.log(
        `No existing ticket found for ${ghHandle}. Creating new collaborator ticket.`
      );
      const request = await spoke.createCollabTicket(body);
      // delete message from queue
      await queue.deleteMessage(receiptHandle);
      console.log(
        `New ticket created: https://mapbox.askspoke.com/next/requests/${request.friendlyId}`
      );
      await spoke.tagRequest(request, tagParams);
    } else {
      console.log('Posting a message to existing ticket with new info.');
      const res = await spoke.postToRequest(ghRequest, body);
      // delete message from queue
      await queue.deleteMessage(receiptHandle);
      const messageText = res.body.content.message.text;
      // add and remove tags as needed
      if (!ghRequest.tags.includes(tagIdToAdd))
        await spoke.tagRequest(ghRequest, tagParams);
      if (ghRequest.tags.includes(tagIdToRemove))
        await spoke.removeTag(ghRequest, tagIdToRemove);

      console.log(
        `New message posted to ${ghRequest.permalink}: ${messageText}`
      );
    }
  } catch (error) {
    const errMsg = `A stack ${process.env.StackName} error occured.`;
    console.log(`${errMsg}\n${error}`); // for troubleshooting
    await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}\n${error}`);
  }
};
