'use strict';

// initiate Spoke API client and pass secret prefix
const secretPrefixSpoke = process.env.SpokeServiceAccountToken;
const Spoke = require('@mapbox/node-spoke');
const spoke = new Spoke(secretPrefixSpoke);

const slack = require('./slack-alerts');
const identity = require('./identity');
const date = require('./date');

// Spoke IDs
const svcAccountId = 'xxxx'; // Spoke user ID for service account

const requestTypeId = 'xxxx'; // "Collaborator Access" request type ID
const collabTeamId = 'xxxx'; // "Collaborator Lifecyle Security" team ID
const requestTypeFieldId = {
  expdate: 'bd6e14ed-4e2a-4045-a25a-xxxx', // "collaborator access expiration date" field ID
  ghhandle: '00b4d172-cfdd-43e7-a292-xxxx', // "collaborator GitHub username" field ID
  collabemail: 'cd76ccbb-fa81-4548-9ba4-xxxx' // "collaborator email address" field ID
};

/**
 * @param {string} collabAction - action taken on collaborator account
 * @param {object} change - changes.permission section of webhook payload
 * @returns {string} phrase appropriate for action taken
 */
const msgPhrase = (collabAction, change) => {
  if (collabAction === 'added') return `with ${change.to} permissions to`;
  else if (collabAction === 'removed') return 'from';
  else if (collabAction === 'edited')
    return `from ${change.from} to ${change.to} permissions in`;
};

/**
 * Returns Spoke ID for a given Github handle
 * @param {String} ghHandle
 */
const getSpokeId = async (ghHandle) => {
  console.log('Getting info on actor from audit log.');
  const idResponse = await identity.getMapboxUser(ghHandle);
  console.log('actor response from api-identity: ', idResponse);
  // TODO: account for when the actor is not a Mapbox human
  // need to return a value that reflects this and decide how to assign the request
  const email = idResponse.login;
  console.log(idResponse.login);
  const user = await spoke.listUsers({ q: email });
  const id = user.body.results[0].id;
  console.log(id);
  return id;
};

/**
 * Creates a new collaborator Spoke ticket
 * @param {Object} eventBody - GitHub Webhook payload piped through SQS
 */
exports.createCollabTicket = async (eventBody) => {
  const time = eventBody.timestamp;
  const collabAction = eventBody.action;
  const collabGithubHandle = eventBody.member.login;
  const actorGithubHandle = eventBody.sender.login;
  const collabRepo = eventBody.repository.full_name;
  const collabEmail = 'n/a';
  const subjectMessage = `${collabGithubHandle} Collaborator Access`;
  const expDate = await date.expDateOneYear(time);
  const actorSpokeId = await getSpokeId(actorGithubHandle);

  // changes section is not included in 'removed' webhook events
  let change = undefined;
  if (collabAction !== 'removed') change = eventBody.changes.permission;

  const requestBody = {
    subject: subjectMessage,
    body: `'${collabGithubHandle}' was ${collabAction} ${msgPhrase(
      collabAction,
      change
    )} ${collabRepo} by '${actorGithubHandle}' at UTC ${time}`,
    privacyLevel: 'private',
    requestType: requestTypeId,
    requester: svcAccountId,
    owner: actorSpokeId,
    team: collabTeamId,
    requestTypeInfo: {
      answeredFields: [
        {
          fieldId: requestTypeFieldId.expdate,
          value: expDate
        },
        {
          fieldId: requestTypeFieldId.ghhandle,
          value: collabGithubHandle
        },
        {
          fieldId: requestTypeFieldId.collabemail,
          value: collabEmail
        }
      ]
    }
  };

  try {
    const res = await spoke.postRequest(requestBody);
    console.log('Spoke ticket created successfully: ', res.body);
    return res.body;
  } catch (error) {
    const errMsg = `An error occurred creating a new collab Spoke ticket for ${collabGithubHandle}. Please manually create a ticket for this collaborator.`;
    await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}: ${error}`);
  }
};

/**
 * Searches requests in the Spoke queue for a matching Github handle
 * @param {string} githubHandle - Github handle of collaborator
 * @returns {Object} Spoke request with the field that matches the collab's GH handle
 * @returns `false` if no match
 */
exports.findByGithubHandle = async (githubHandle) => {
  // Spoke "list requests" query params
  const params = {
    team: collabTeamId,
    q: `"${githubHandle}"`
  };

  try {
    const res = await spoke.listRequests(params);
    const requests = res.body.results;
    if (requests.length > 0) {
      console.log(
        `Ticket with github handle ${githubHandle} found: ${requests[0].permalink}`
      );
      return requests[0];
    }
    console.log(
      `No existing ticket with github handle '${githubHandle}' found.`
    );
    return false;
  } catch (error) {
    const errMsg = `An error occurred searching the queue for the collab GitHub handle '${githubHandle}'. Please manually search for an existing ticket and check logs for any actions required.`;
    await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}: ${error}`);
  }
};

/**
 * Posts a message to an existing request with changes to collab access
 * @param {Object} request - request object
 * @param {Object} event - CloudWatch event
 */
exports.postToRequest = async (request, eventBody) => {
  const time = eventBody.timestamp;
  const collabAction = eventBody.action;
  const collabGithubHandle = eventBody.member.login;
  const actorGithubHandle = eventBody.sender.login;
  const collabRepo = eventBody.repository.full_name;
  // changes section is not included in 'removed' webhook events
  let change = undefined;
  if (collabAction !== 'removed') change = eventBody.changes.permission;
  const msgBody = {
    actor: {
      kind: 'User',
      ref: svcAccountId
    },
    content: {
      message: {
        text: `'${collabGithubHandle}' was ${collabAction} ${msgPhrase(
          collabAction,
          change
        )} ${collabRepo} by '${actorGithubHandle}' at UTC ${time}`
      }
    }
  };
  try {
    const res = spoke.postMessage(request.id, msgBody);
    console.log('New message posted successfully!');
    return res;
  } catch (error) {
    const errMsg = `An error occurred posting a message to ${request.id}. Please check logs and manually make the required updates to the ticket.`;
    await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}: ${error}`);
  }
};

/**
 *
 * @param {object} request - the request to tag
 * @param {object} params - the Add tags body payload
 * @returns - JSON body response
 */
exports.tagRequest = async (request, params) => {
  try {
    const res = spoke.addTags(request.id, params);
    console.log('Request tagged successfully!');
    return res;
  } catch (error) {
    const errMsg = `An error occurred tagging the request ${request.id}. Please check logs and manually add the required tags to the ticket.`;
    await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}: ${error}`);
    // TODO: decide if Slack alert / low urgency PD incident is better than throwing an Error
    // since the thrown error causes the message to be re-read in the queue
  }
};

/**
 *
 * @param {object} request - the request
 * @param {string} tagId - the tag ID to remove
 * @returns - JSON body response
 */
exports.removeTag = async (request, tagId) => {
  try {
    const res = spoke.removeTags(request.id, tagId);
    console.log('Tag removed successfully!');
    return res;
  } catch (error) {
    const errMsg = `An error occurred removing the tag for request ${request.id}. Please check logs and manually remove the tag.`;
    await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}: ${error}`);
    // TODO: decide if Slack alert / low urgency PD incident is better than throwing an Error
    // since the thrown error causes the message to be re-read in the queue
  }
};

/**
 * finds Spoke collaborator tickets that are have an expiration date of today
 * @returns {array} list of outside collaborator Github handles with expired tickets
 */
exports.findExpDate = async (date) => {
  let start,
    total = 0;
  const limit = 40;
  // Spoke "list requests" query params
  const params = {
    team: collabTeamId,
    limit: limit,
    start: start
  };
  const expiredRequests = [];
  let ghHandle;

  try {
    for (start = 0; start <= total; start = start + limit) {
      const res = await spoke.listRequests(params);
      total = res.total;
      const requests = res.body.results;
      for (const request of requests) {
        const fields = request.requestTypeInfo.answeredFields;
        for (const field of fields) {
          if (field.field.uuid === requestTypeFieldId.ghhandle) {
            ghHandle = field.simpleValue;
          }
          if (field.field.uuid === requestTypeFieldId.expdate) {
            if (field.simpleValue === date) {
              expiredRequests.push(ghHandle);
            }
          }
        }
      }
    }
    if (expiredRequests.length === 0) console.log('No expired tickets found.');
    return expiredRequests;
  } catch (error) {
    const errMsg = `An error occurred searching the queue for expired collaborator tickets. Please check logs.`;
    await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}: ${error}`);
  }
};

// get exp date and use for auto-expire function
// different exp dates for different repos ?
// how to message owner one month before exp date for Slack and GH collabs
// idea: Slack message with button to extend access or not
// idea: if owner is inactive in Slack, message manager or team + IT
