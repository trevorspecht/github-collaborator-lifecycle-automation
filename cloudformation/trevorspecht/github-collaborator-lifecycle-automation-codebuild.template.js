'use strict';

const cf = require('@mapbox/secret-cloudfriend');

module.exports = new cf.shortcuts.CodeBuildProject({
  LogicalName: 'CodeBuildProject',
  Source: {
    Location: 'https://github.com/trevorspecht/github-collaborator-lifecycle-automation'
  }
});
