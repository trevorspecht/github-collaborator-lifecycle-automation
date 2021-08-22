'use strict';

const queue = require('./queue');
const slack = require('./slack-alerts');
const sm = require('./secrets');

const { Octokit } = require('@octokit/core');
const { paginateRest } = require('@octokit/plugin-paginate-rest');
const {
  restEndpointMethods
} = require('@octokit/plugin-rest-endpoint-methods');
const { createAppAuth } = require('@octokit/auth-app');

/**
 * handler for GithubIngestion Lambda
 * @param {Object} event - Github App webhook payload
 */
exports.handler = async (event) => {
  console.log('webhook payload: ', event);
  console.log('Sending to queue.');
  try {
    const queueRes = await queue.send(event);
    console.log(queueRes);
  } catch (error) {
    const errMsg = `An error occurred sending to the queue.`;
    await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}\n${error}`);
  }
};

/**
 * Creates an Octokit instance that is authenticated as an app installation
 * with automated installation token refresh
 * https://github.com/octokit/auth-app.js/
 * @param {String} org - Github org name
 * @returns authenticated Octokit instance
 */
const authAsInstallation = async (org) => {
  // decode base64-encoded private key from AWS Secrets Manager
  let encodedSecret, privateKey, appId, installationId;
  switch (org) {
    case 'mapbox':
      encodedSecret = await sm.getSecret(process.env.GhAppSecretKeyMapbox);
      privateKey = Buffer.from(encodedSecret, 'base64').toString('ascii');
      appId = 102441;
      installationId = 14988838;
      break;
    case 'mapbox-collab':
      encodedSecret = await sm.getSecret(
        process.env.GhAppSecretKeyMapboxCollab
      );
      privateKey = Buffer.from(encodedSecret, 'base64').toString('ascii');
      appId = 113645;
      installationId = 16701929;
      break;
    default:
      console.log('Github org not recognized, exiting.');
      return;
  }

  try {
    const appAuth = createAppAuth({
      appId: appId,
      privateKey: privateKey
    });

    // Retrieve installation access token
    const installationAuth = await appAuth({
      type: 'installation',
      installationId: installationId
    });

    const MyOctokit = Octokit.plugin(restEndpointMethods, paginateRest);
    const installationOctokit = new MyOctokit({ auth: installationAuth.token });
    return installationOctokit;
  } catch (error) {
    const errMsg = `An error occurred creating Github App authentication for the ${org} org.`;
    await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}\n${error}`);
  }
};

/**
 * Removes outside collaborator from all org repos
 * Note: will not remove a pending invitation
 * @param {String} ghOrg - the Github organization name
 * @param {String} ghHandle - the collaborator Github handle
 */
exports.removeCollab = async (ghOrg, ghHandle) => {
  try {
    const installationOctokit = await authAsInstallation(ghOrg);
    const response = await installationOctokit.request(
      'DELETE /orgs/{org}/outside_collaborators/{username}',
      {
        org: ghOrg,
        username: ghHandle
      }
    );
    console.log(
      'Collaborator %s was removed from the %s org.',
      ghHandle,
      ghOrg
    );
    return response;
  } catch (error) {
    const errMsg = `An error occurred removing collaborator ${ghHandle} from the ${ghOrg} org. Please check logs and manually remove the collab.`;
    await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}\n${error}`);
  }
};

/**
 *
 * @param {object} params - search params
 * @see https://docs.github.com/en/rest/reference/orgs#get-the-audit-log-for-an-organization
 * @returns array of audit log search results
 */
exports.getAuditLog = async (params) => {
  try {
    const installationOctokit = await authAsInstallation(params.org);

    const response = installationOctokit.paginate('GET /orgs/{org}/audit-log', {
      org: params.org,
      include: params.include,
      order: params.order,
      per_page: 100,
      phrase: params.phrase
    });
    console.log(
      'Successfully retrieved the audit log for the %s Github org.',
      params.org
    );
    return response;
  } catch (error) {
    const errMsg = `An error occurred getting the audit log for the ${params.org} Github org.`;
    await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}\n${error}`);
  }
};

/**
 * gets repositories in an org
 * @param {String} ghOrg - The Github org name
 * @returns {Array} - an array of names of repositories in the org
 */
exports.getOrgRepos = async (ghOrg) => {
  try {
    const installationOctokit = await authAsInstallation(ghOrg);
    const repos = await installationOctokit.paginate(
      'GET /orgs/{org}/repos',
      {
        org: ghOrg
      },
      (response) => response.data.map((repo) => repo.name)
    );
    console.log(`Successfully got all ${ghOrg} org repositories.`);
    return repos;
  } catch (error) {
    const errMsg = `An error occurred getting repositories in the ${ghOrg} org.`;
    await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}\n${error}`);
  }
};

/**
 *
 * @param {String} ghOrg - The Github org name
 * @param {String} repo - The repository name
 * @returns {Array} - an array of repository collaborator Github handles (both org members and outside collabs)
 */
exports.getRepoCollabs = async (ghOrg, repo) => {
  try {
    const installationOctokit = await authAsInstallation(ghOrg);
    const collabs = await installationOctokit.paginate(
      'GET /repos/{owner}/{repo}/collaborators',
      {
        owner: ghOrg,
        repo: repo
      }
      // (response) => response.data.map((collab) => collab.login) // return just handles
    );
    console.log(`Successfully got ${repo} repo collabs.`);
    return collabs;
  } catch (error) {
    const errMsg = `An error occurred getting collaborators in the ${repo} repo.`;
    await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}\n${error}`);
  }
};

/**
 * Gets all outside collaborators for a Githug org
 * @param {String} ghOrg - the Github org name
 * @returns {Array} - an array of org outside collaborator Github handles
 */
exports.getOrgOutsideCollabs = async (ghOrg) => {
  try {
    const installationOctokit = await authAsInstallation(ghOrg);
    const collabs = await installationOctokit.paginate(
      'GET /orgs/{org}/outside_collaborators',
      {
        org: ghOrg
      },
      (response) => response.data.map((collab) => collab.login)
    );
    console.log(`Successfully got all ${ghOrg} org outside collaborators.`);
    return collabs;
  } catch (error) {
    const errMsg = `An error occurred getting outside collaborators in the ${ghOrg} org.`;
    // await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}\n${error}`);
  }
};

/**
 * Gets all members for a Githug org
 * @param {String} ghOrg - the Github org name
 * @returns {Array} - an array of org member Github handles
 */
exports.getOrgMembers = async (ghOrg) => {
  try {
    const installationOctokit = await authAsInstallation(ghOrg);
    const members = await installationOctokit.paginate(
      'GET /orgs/{org}/members',
      {
        org: ghOrg
      },
      (response) => response.data.map((member) => member.login)
    );
    console.log(`Successfully got all ${ghOrg} org members.`);
    return members;
  } catch (error) {
    const errMsg = `An error occurred getting members in the ${ghOrg} org.`;
    await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}\n${error}`);
  }
};

/**
 * checks org membership for a github user
 * @param {String} ghOrg - the Github org name
 * @param {String} ghHandle - the Github handle
 * @returns the member object or the error object
 */
exports.getOrgMembership = async (ghOrg, ghHandle) => {
  try {
    const installationOctokit = await authAsInstallation(ghOrg);
    const result = await installationOctokit.paginate(
      'GET /orgs/{org}/memberships/{username}',
      {
        org: ghOrg,
        username: ghHandle
      }
    );
    console.log(`Successfully got ${ghOrg} org membership for ${ghHandle}.`);
    return result;
  } catch (error) {
    if (error.status === 404) {
      return error.status;
    } else {
      const errMsg = `An error occurred getting ${ghOrg} org membership for ${ghHandle}.`;
      await slack.sendStackAlert(error, errMsg);
      throw new Error(`${errMsg}\n${error}`);
    }
  }
};


/**
 * gets audit log activity for a given collaborator
 * @param {object} params - search params
 * @see https://docs.github.com/en/rest/reference/orgs#get-the-audit-log-for-an-organization
 * @returns array of audit log search results
 */
exports.getAuditLogActivity = async (params) => {
  try {
    const installationOctokit = await authAsInstallation(params.org);

    const response = installationOctokit.paginate('GET /orgs/{org}/audit-log', {
      org: params.org,
      include: params.include,
      order: params.order,
      per_page: 100,
      phrase: params.phrase
    });
    console.log(
      'Successfully retrieved the audit log for the %s Github org.',
      params.org
    );
    return response;
  } catch (error) {
    const errMsg = `An error occurred getting the audit log for the ${params.org} Github org.`;
    await slack.sendStackAlert(error, errMsg);
    throw new Error(`${errMsg}\n${error}`);
  }
};