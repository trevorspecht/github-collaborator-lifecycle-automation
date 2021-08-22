'use strict';

const github = require('./github');
const spoke = require('./spoke');
const date = require('./date');

const today = new Date();
const orgs = ['mapbox', 'mapbox-collab'];

/**
 * Handler for dailyLambda that runs once per day at 1600 UTC
 * This Lambda does the following:
 * - checks the Spoke queue for expiration dates
 * - expires collaborators who have reached their expiration date
 */
exports.handler = async () => {
  const expDate = await date.expDateToday(today);
  const expired = await spoke.findExpDate(expDate);

  for (const org of orgs) {
    const orgCollabs = await github.getOrgOutsideCollabs(org);
    for (const collab of expired) {
      if (orgCollabs.includes(collab)) {
        await github.removeCollab(org, collab);
      }
    }
  }
};
