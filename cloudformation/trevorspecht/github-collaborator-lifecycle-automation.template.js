'use strict';

const cf = require('@mapbox/cloudfriend');

const Parameters = {
  GitSha: {
    Type: 'String',
    Description: 'GitSha to deploy'
  },
  SpokeServiceAccountToken: {
    Type: 'String',
    Description:
      'Path to Spoke service account token in AWS Secrets Manager',
    Default: 'general/IT/svc-accountname-redacted'
  },
  GhAppSecretKeyMapbox: {
    Type: 'String',
    Description:
      'Path to redacted Github App token in AWS Secrets Manager',
    Default:
      'general/IT/redacted/mapbox/github-app-private-key'
  },
  GhAppSecretKeyMapboxCollab: {
    Type: 'String',
    Description:
      'Path to mapbox-collab-cls Github App token in AWS Secrets Manager',
    Default:
      'general/IT/redacted/mapbox-collab/github-app-private-key'
  },
  ItBotsTestingWebhookUrl: {
    Type: 'String',
    Description:
      'Collab Helper Slack App Webhook URL for the #it-bots-testing channel',
    Default:
      'general/IT/redacted/it-bots-testing-slack-webhook-url'
  },
  AlertsItWebhookUrl: {
    Type: 'String',
    Description:
      'Collab Helper Slack App Webhook URL for the #alerts_it channel',
    Default:
      'general/IT/redacted/alerts_it-slack-webhook-url'
  },
  GithubEventLogUrl: {
    Type: 'String',
    Description: 'CloudWatch logs URL for github-events-queue Lambda',
    Default:
      'https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252FIT-redacted-testing-github-events-queue'
  }
};

const Conditions = {
  IsTestingStack: cf.equals(
    cf.stackName,
    'IT-redacted-testing'
  ),
  IsStagingStack: cf.equals(
    cf.stackName,
    'IT-redacted-staging'
  ),
  IsProductionStack: cf.equals(
    cf.stackName,
    'IT-redacted-production'
  )
};

// SQS queue
const sqsQueue = new cf.shortcuts.Queue({
  LogicalName: 'GithubEventsQueue',
  FifoQueue: true,
  ContentBasedDeduplication: true,
  WaitTimeSeconds: 20,
  VisibilityTimeout: 300
});

// Hookshot Github API Gateway
const githubWebhook = new cf.shortcuts.hookshot.Github({
  Prefix: 'GhWebhook',
  PassthroughTo: 'GhIngestion',
  LoggingLevel: 'ERROR'
});

// Lambda that accepts Github webhook payloads
const githubIngestion = new cf.shortcuts.Lambda({
  LogicalName: 'GhIngestion',
  FunctionName: cf.join('-', [cf.stackName, 'github-ingestion']),
  Code: {
    S3Bucket: cf.join('-', ['utility', cf.accountId, cf.region]),
    S3Key: cf.join([
      'bundles/IT-redacted/',
      cf.ref('GitSha'),
      '.zip'
    ])
  },
  Runtime: 'nodejs14.x',
  Handler: 'lib/queue.handler',
  Environment: {
    Variables: {
      QueueUrl: cf.ref('GithubEventsQueue'),
      SlackWebhookUrl: cf.if(
        'IsTestingStack',
        cf.ref('ItBotsTestingWebhookUrl'),
        cf.ref('AlertsItWebhookUrl')
      ),
      GithubEventFuncName: cf.join('-', [cf.stackName, 'github-events-queue']),
      GithubEventLogUrl: cf.ref('GithubEventLogUrl'),
      StackRegion: cf.region,
      StackName: cf.stackName
    }
  },
  Statement: [
    {
      Effect: 'Allow',
      Action: 'sqs:SendMessage',
      Resource: [cf.getAtt('GithubEventsQueue', 'Arn')]
    },
    {
      Effect: 'Allow',
      Action: 'secretsmanager:GetSecretValue',
      Resource: cf.arn(
        'secretsmanager',
        'secret:general/IT/redacted/it-bots-testing-slack-webhook-url*'
      )
    },
    {
      Effect: 'Allow',
      Action: 'secretsmanager:GetSecretValue',
      Resource: cf.arn(
        'secretsmanager',
        'secret:general/IT/redacted/alerts_it-slack-webhook-url*'
      )
    },
    {
      Action: ['execute-api:invoke'],
      Effect: 'Allow',
      Resource: [
        cf.join(['arn:aws:execute-api:*:', cf.accountId, ':*/*/GET/*'])
      ]
    }
  ]
});

// Lambda that reads messages from the SQS queue
const githubQueue = new cf.shortcuts.QueueLambda({
  LogicalName: 'GithubQueue',
  FunctionName: cf.join('-', [cf.stackName, 'github-events-queue']),
  Code: {
    S3Bucket: cf.join('-', ['utility', cf.accountId, cf.region]),
    S3Key: cf.join([
      'bundles/IT-redacted/',
      cf.ref('GitSha'),
      '.zip'
    ])
  },
  Runtime: 'nodejs14.x',
  Handler: 'index.handler',
  EventSourceArn: cf.getAtt('GithubEventsQueue', 'Arn'),
  ReservedConcurrentExecutions: 1,
  Environment: {
    Variables: {
      QueueUrl: cf.ref('GithubEventsQueue'),
      GithubEventFuncName: cf.join('-', [cf.stackName, 'github-events-queue']),
      GithubEventLogUrl:
        'https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252FIT-redacted-testing-github-events-queue',
      SpokeServiceAccountToken: cf.ref('SpokeServiceAccountToken'),
      GhAppSecretKeyMapbox: cf.ref('GhAppSecretKeyMapbox'),
      GhAppSecretKeyMapboxCollab: cf.ref('GhAppSecretKeyMapboxCollab'),
      SlackWebhookUrl: cf.if(
        'IsTestingStack',
        cf.ref('ItBotsTestingWebhookUrl'),
        cf.ref('AlertsItWebhookUrl')
      ),
      StackRegion: cf.region,
      StackName: cf.stackName
    }
  },
  Statement: [
    {
      Effect: 'Allow',
      Action: 'sqs:ReceiveMessage',
      Resource: [cf.getAtt('GithubEventsQueue', 'Arn')]
    },
    {
      Effect: 'Allow',
      Action: 'sqs:DeleteMessage',
      Resource: [cf.getAtt('GithubEventsQueue', 'Arn')]
    },
    {
      Effect: 'Allow',
      Action: 'sqs:GetQueueAttributes',
      Resource: [cf.getAtt('GithubEventsQueue', 'Arn')]
    },
    {
      Effect: 'Allow',
      Action: 'secretsmanager:GetSecretValue',
      Resource: cf.arn(
        'secretsmanager',
        'secret:general/IT/svc-spoke-aws-collaborators*'
      )
    },
    {
      Effect: 'Allow',
      Action: 'secretsmanager:GetSecretValue',
      Resource: cf.arn(
        'secretsmanager',
        'secret:general/IT/redacted/mapbox/github-app-private-key*'
      )
    },
    {
      Effect: 'Allow',
      Action: 'secretsmanager:GetSecretValue',
      Resource: cf.arn(
        'secretsmanager',
        'secret:general/IT/redacted/mapbox-collab/github-app-private-key*'
      )
    },
    {
      Effect: 'Allow',
      Action: 'secretsmanager:GetSecretValue',
      Resource: cf.arn(
        'secretsmanager',
        'secret:general/IT/redacted/it-bots-testing-slack-webhook-url*'
      )
    },
    {
      Effect: 'Allow',
      Action: 'secretsmanager:GetSecretValue',
      Resource: cf.arn(
        'secretsmanager',
        'secret:general/IT/redacted/alerts_it-slack-webhook-url*'
      )
    },
    {
      Action: ['execute-api:invoke'],
      Effect: 'Allow',
      Resource: [
        cf.join(['arn:aws:execute-api:*:', cf.accountId, ':*/*/GET/*'])
      ]
    }
  ]
});

// Scheduled Lambda
const dailyLambda = new cf.shortcuts.ScheduledLambda({
  LogicalName: 'DailyLambda',
  FunctionName: cf.join('-', [cf.stackName, 'daily-lambda']),
  Code: {
    S3Bucket: cf.join('-', ['utility', cf.accountId, cf.region]),
    S3Key: cf.join([
      'bundles/IT-redacted/',
      cf.ref('GitSha'),
      '.zip'
    ])
  },
  Runtime: 'nodejs14.x',
  Handler: 'lib/expiration-notification.handler',
  ScheduleExpression: 'cron(0 16 * * ? *)', //  run once per day at 1600 UTC
  Environment: {
    Variables: {
      DailyLambdaFuncName: cf.join('-', [cf.stackName, 'daily-lambda']),
      GithubEventLogUrl:
        'https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252FIT-redacted-testing-github-events-queue',
      SpokeServiceAccountToken: cf.ref('SpokeServiceAccountToken'),
      GhAppSecretKeyMapbox: cf.ref('GhAppSecretKeyMapbox'),
      GhAppSecretKeyMapboxCollab: cf.ref('GhAppSecretKeyMapboxCollab'),
      SlackWebhookUrl: cf.if(
        'IsTestingStack',
        cf.ref('ItBotsTestingWebhookUrl'),
        cf.ref('AlertsItWebhookUrl')
      ),
      StackRegion: cf.region,
      StackName: cf.stackName
    }
  },
  Statement: [
    {
      Effect: 'Allow',
      Action: 'secretsmanager:GetSecretValue',
      Resource: cf.arn(
        'secretsmanager',
        'secret:general/IT/svc-accountname-redacted*'
      )
    },
    {
      Effect: 'Allow',
      Action: 'secretsmanager:GetSecretValue',
      Resource: cf.arn(
        'secretsmanager',
        'secret:general/IT/redacted/mapbox/github-app-private-key*'
      )
    },
    {
      Effect: 'Allow',
      Action: 'secretsmanager:GetSecretValue',
      Resource: cf.arn(
        'secretsmanager',
        'secret:general/IT/redacted/mapbox-collab/github-app-private-key*'
      )
    },
    {
      Effect: 'Allow',
      Action: 'secretsmanager:GetSecretValue',
      Resource: cf.arn(
        'secretsmanager',
        'secret:general/IT/redacted/it-bots-testing-slack-webhook-url*'
      )
    },
    {
      Effect: 'Allow',
      Action: 'secretsmanager:GetSecretValue',
      Resource: cf.arn(
        'secretsmanager',
        'secret:general/IT/redacted/alerts_it-slack-webhook-url*'
      )
    },
    {
      Action: ['execute-api:invoke'],
      Effect: 'Allow',
      Resource: [
        cf.join(['arn:aws:execute-api:*:', cf.accountId, ':*/*/GET/*'])
      ]
    }
  ]
});

module.exports = cf.merge(
  sqsQueue,
  { Parameters },
  { Conditions },
  githubWebhook,
  githubIngestion,
  githubQueue,
  dailyLambda
);
