'use strict';

const apiIdentity = require('@mapbox/api-identity');
const identitySDK = new apiIdentity.IdentitySDK();
const slack = require('./slack-alerts');

exports.getMapboxUser = async (ghHandle) => {
  try {
    const user = await identitySDK.lookup(ghHandle, { type: 'github-handle' });
    return user;
  } catch (error) {
    // an error does not necessarily mean the query failed
    // pass returned errors to the handler function
    return error;
  }
};

exports.orgMembershipHandler = async (apiIdentityResponse, ghHandle) => {
  if (apiIdentityResponse['github-handle'] === ghHandle) {
    console.log(`${ghHandle} is an employee, no processing required.`);
    return true;
  } else if (apiIdentityResponse.statusCode === 422) {
    console.log(
      `${ghHandle} is an outside collaborator in GitHub. Processing...`
    );
    return false;
  } else if (apiIdentityResponse.statusCode === (400 || 403 || 429)) {
    const errMsg = `api-identity lookup error for Github handle '${ghHandle}'. \nIf the user is an outside collab, manually update their existing collab ticket or create a new one.`;
    await slack.sendStackAlert(apiIdentityResponse.statusCode, errMsg);
    throw new Error(`${errMsg}: ${apiIdentityResponse}`);
  }
};
