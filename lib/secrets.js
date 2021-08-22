'use strict';

const AWS = require('aws-sdk');

module.exports.getSecret = async (awsSmSecretPath) => {
  const region = 'us-east-1';

  const sm = new AWS.SecretsManager({
    region: region
  });
  const params = {
    SecretId: awsSmSecretPath
  };

  return new Promise((resolve, reject) => {
    console.log('Retrieving aws SM secret');
    sm.getSecretValue(params, (err, data) => {
      if (err) {
        console.log(`error retrieving aws sm secret: ${awsSmSecretPath}`);
        reject(err);
      } else {
        console.log('retrieved aws sm secret successfully');
        resolve(data.SecretString);
      }
    });
  });
};
