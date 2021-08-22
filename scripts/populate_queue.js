'use strict';

// This file contains scripts run manually to initally populate the atSpoke ticket queue will the current state of outside GitHub collaborators

// initiate Spoke API client and pass secret prefix
const secretPrefixSpoke = process.env.SpokeServiceAccountToken;
const Spoke = require('@mapbox/node-spoke');
const spoke = new Spoke(secretPrefixSpoke);

const github = require('../lib/github');
const identity = require('../lib/identity');
const date = require('../lib/date');
const csvtojson = require('csvtojson');

const svcAccountId = 'xxxx'; // Spoke user ID for svc-spoke-aws-collaborators@mapbox.com
let requestTypeId,
  collabTeamId,
  requestTypeFieldId,
  collabAccessGrantedTagId,
  collabAccessRemovedTagId;

// if test argument is given, these variables change to make changes to the CLS Spoke team test queue
if (process.argv[2] === 'test') {
  requestTypeId = 'xxxx'; // "Collaborator Tracking" request type ID in the CLS queue
  collabTeamId = 'xxxx'; // "CLS" team ID
  requestTypeFieldId = {
    expdate: '2b8cevvvvvd96-523e-4911-9259-', // IDs for corresponding fields in the CLS queue request type
    ghhandle: 'a4bxxxxbcb69-f5a2-4ca0-bb47-',
    collabemail: '2xxxx35b0370-6da9-4f84-9069-'
  };
  collabAccessGrantedTagId = 'xxxx';
  collabAccessRemovedTagId = 'xxxx';
} else if (!process.argv[2]) {
  requestTypeId = 'xxxx'; // "Collaborator Access" request type ID
  collabTeamId = 'xxxx'; // "Collaborator Lifecyle Security" team ID
  requestTypeFieldId = {
    expdate: 'xxxx', // "collaborator access expiration date" field ID
    ghhandle: 'xxxx', // "collaborator GitHub username" field ID
    collabemail: 'xxxx', // "collaborator email address" field ID
    collabFullname: 'xxxx' // "collaborator full name" field ID
  };
  collabAccessGrantedTagId = 'xxxx';
  collabAccessRemovedTagId = 'xxxx';
}

const msgPhrase = (collabAction) => {
  if (collabAction === 'repo.add_member') return 'was added to';
  else if (collabAction === 'repo.remove_member') return 'was removed from';
  else if (collabAction === 'repo.update_member')
    return 'had permissions changed in';
};

const getSpokeId = async (ghHandle) => {
  console.log('Getting info on actor from the audit log.');
  const idResponse = await identity.getMapboxUser(ghHandle);
  let email;
  if (idResponse.login) {
    email = idResponse.login;
    console.log(email);
  } else if (idResponse.statusCode === 422) {
    // assign requests to service account id
    console.log(`Actor ${ghHandle} is not a Mapbox human.`);
    return svcAccountId;
  }
  const user = await spoke.listUsers({ q: email });
  const id = user.body.results[0].id;
  return id;
};

const tagRequest = async (request, params) => {
  try {
    const res = await spoke.addTags(request.id, params);
    console.log('Request tagged successfully!');
    return res;
  } catch (error) {
    const errMsg = `An error occurred tagging the request ${request.id}. Please check logs and manually add the required tags to the ticket.`;
    throw new Error(`${errMsg}: ${error}`);
  }
};

const removeTag = async (request, tagId) => {
  try {
    const res = await spoke.removeTags(request.id, tagId);
    console.log('Tag removed successfully!');
    return res;
  } catch (error) {
    const errMsg = `An error occurred removing the tag for request ${request.id}. Please check logs and manually remove the tag.`;
    throw new Error(`${errMsg}: ${error}`);
  }
};

const createCollabTicket = async (log) => {
  const timestamp = log['@timestamp'];
  const collabAction = log.action;
  const collabGithubHandle = log.user;
  const actorGithubHandle = log.actor;
  const collabEmail = 'n/a';
  const collabRepo = log.repo;
  const subjectMessage = `${collabGithubHandle} Collaborator Access`;
  const time = new Date(timestamp).toISOString();
  const expDate = await date.expDateOneYear(time);
  const actorSpokeId = await getSpokeId(actorGithubHandle);
  console.log(actorSpokeId);

  const requestParams = {
    subject: subjectMessage,
    body: `'${collabGithubHandle}' ${msgPhrase(
      collabAction
    )} ${collabRepo} by '${actorGithubHandle}' at ${time}`,
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

  // select tag to apply based on action
  let tagIdToAdd = collabAccessGrantedTagId;
  if (collabAction === 'repo.remove_member') {
    tagIdToAdd = collabAccessRemovedTagId;
  }
  const tagParams = {
    tags: [
      {
        _id: tagIdToAdd
      }
    ]
  };

  try {
    const res = await spoke.postRequest(requestParams);
    console.log('Spoke ticket created successfully: ', res.body);
    await tagRequest(res.body, tagParams);
    return res.body;
  } catch (error) {
    const errMsg = `An error occurred creating a new collab Spoke ticket for ${collabGithubHandle}. Please manually create a ticket for this collaborator.`;
    // await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}: ${error}`);
  }
};

const postToRequest = async (request, log) => {
  const timestamp = log['@timestamp'];
  const time = new Date(timestamp);
  const collabAction = log.action;
  const collabGithubHandle = log.user;
  const actorGithubHandle = log.actor;
  const collabRepo = log.repo;
  const msgBody = {
    actor: {
      kind: 'User',
      ref: svcAccountId
    },
    content: {
      message: {
        text: `'${collabGithubHandle}' ${msgPhrase(
          collabAction
        )} ${collabRepo} by '${actorGithubHandle}' at ${time}`
      }
    }
  };

  // select tag to apply based on action
  let tagIdToAdd = collabAccessGrantedTagId;
  let tagIdToRemove = collabAccessRemovedTagId;
  if (collabAction === 'repo.remove_member') {
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

  try {
    const res = await spoke.postMessage(request.id, msgBody);
    console.log('New message posted successfully!');
    // add and remove tags as needed
    if (!request.tags.includes(tagIdToAdd))
      await tagRequest(request, tagParams);
    if (request.tags.includes(tagIdToRemove)) console.log('removing tag');
    await removeTag(request, tagIdToRemove);
    return res;
  } catch (error) {
    const errMsg = `An error occurred posting a message to ${request.id}. Please check logs and manually make the required updates to the request.`;
    throw new Error(`${errMsg}: ${error}`);
  }
};

/**
 * updates a request based on an audit log entry
 * initially only updates the expiration date field
 * @param {Object} request - Spoke request object
 * @param {Object} log - Github audit log entry
 */
const updateRequest = async (request, log) => {
  const timestamp = log['@timestamp'];
  const time = new Date(timestamp).toISOString();
  const expDate = await date.expDateOneYear(time);
  const expDateParams = {
    requestTypeInfo: {
      answeredFields: [
        {
          fieldId: requestTypeFieldId.expdate,
          value: expDate
        }
      ]
    }
  };

  try {
    await spoke.updateRequest(request.id, expDateParams);
    console.log('Successfully updated expiration date.');
  } catch (error) {
    const errMsg = `An error occurred updating a request, id: ${request.id}. Please check logs and manually make the required updates to the request.`;
    throw new Error(`${errMsg}: ${error}`);
  }
};

/**
 * Finds a request by searching for a Github username
 * Assumes there is only one request in a given team queue that includes the Github handle
 * @param {String} githubHandle 
 * @returns request object
 */
const findByGithubHandle = async (githubHandle) => {
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
    throw new Error(`${errMsg}: ${error}`);
  }
};

const populateQueue = async (ghOrg) => {
  // get audit logs for repo member events

  const params = {
    org: ghOrg,
    include: 'all',
    phrase:
      'action:repo.add_member action:repo.remove_member action:repo.update_member created:2021-06-27..2021-06-28',
    order: 'asc'
  };
  const logs = await github.getAuditLog(params);

  for (const log of logs) {
    // check if collab is a Mapbox employee
    const apiIdentityResponse = await identity.getMapboxUser(log.user);
    const handlerResponse = await identity.orgMembershipHandler(
      apiIdentityResponse,
      log.user
    );
    if (!handlerResponse) {
      // check for existing Spoke ticket
      console.log('username:', log.user);
      const request = await findByGithubHandle(log.user);
      if (!request) {
        await createCollabTicket(log);
      } else {
        await postToRequest(request, log);
        if (log.action !== 'repo.remove_member')
          await updateRequest(request, log);
      }
    }
  }
};

populateQueue('mapbox');

/**
 * specialized function to process an array of outside collabs created from a csv
 * @param {Object} collab - csv row => json array element
 */
const createCollabTicketFromCsv = async (collab) => {
  const collabEmail = 'n/a';
  const collabRepos = collab.repositories;
  const collabGithubHandle = collab.login;
  const collabFullname = collab.name;
  const subjectMessage = `${collabGithubHandle} Collaborator Access`;
  const body = `'${collabGithubHandle}' is an outside collaborator in these repos: ${collabRepos}`;
  const time = new Date().toISOString();
  const expDate = await date.expDateOneYear(time);

  const requestParams = {
    subject: subjectMessage,
    body: body,
    privacyLevel: 'private',
    requestType: requestTypeId,
    requester: svcAccountId,
    owner: svcAccountId,
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
        },
        {
          fieldId: requestTypeFieldId.collabFullname,
          value: collabFullname
        }
      ]
    }
  };

  const tagParams = {
    tags: [
      {
        _id: collabAccessGrantedTagId
      }
    ]
  };

  try {
    const res = await spoke.postRequest(requestParams);
    console.log(`Spoke ticket for ${collabGithubHandle} created successfully: `, res.body);
    await spoke.addTags(res.body.id, tagParams);
    // return res;
  } catch (error) {
    const errMsg = `An error occurred creating a new collab Spoke ticket for ${collabGithubHandle}. Please manually create a ticket for this collaborator.`;
    throw new Error(`${errMsg}: ${error}`);
  }
};

/**
 * convert a csv into an array of json elements
 * feed each element to a function that will create a Spoke collab ticket
 */
const populateQueueFromCsv = async () => {
  const csvFile = './collabs.csv';
  const csvArray = await csvtojson().fromFile(csvFile);

  for (const collab of csvArray) {
    await createCollabTicketFromCsv(collab);
  }
};

// populateQueueFromCsv();

/**
 * validates if all outside collabs in an org have a Spoke ticket
 * @param {String} org 
 */
const collabsNoTicket = async (org) => {
  const collabsWithoutTicket = [];
  const collabs = await github.getOrgOutsideCollabs(org);
  console.log('found %s collaborators in the %s org.', collabs.length, org);
  for (const collab of collabs) {
    const request = await findByGithubHandle(collab);
    if (!request) collabsWithoutTicket.push(collab);
  }
  console.log(collabsWithoutTicket.length);
};

// collabsNoTicket('mapbox');

/**
 * Deletes all the requests in a team queue
 * BE CAREFUL!! - requests can't be easily restored
 * !! If you don't supply a teamId this will delete all requests !!
 * @param {String} teamId - ID of team queue
 */
const clearQueue = async (teamId) => {

  let start = 0;
  const limit = 50;
  let total = limit;
  let res, requests;
  // Spoke "list requests" query params
  const params = {
    team: teamId,
    limit: limit,
    start: start
  };

  try {
    for (start = 0; total >= limit; start = start + limit) {
      res = await spoke.listRequests(params);
      total = res.body.total;
      console.log(`${total} requests left to delete.`);
      requests = res.body.results;
      for (const request of requests) {
        await spoke.deleteRequest(request.id);
      }
      console.log('deleted %s requests', limit);
    }
  } catch (error) {
    const errMsg = `An error occurred deleting a request.`;
    throw new Error(`${errMsg}: ${error}`);
  }
};
