# Architecture

An overview of the architecture of Collaborator Lifecycle Security

## How does CLS work?

A Github App in each GitHub Organization with a configured webhook subscribed to Member events sends a webhook payload to a Lambda’s API Gateway endpoint. The Lambda then sends a message that contains the webhook payload to a FIFO SQS queue. A Queue Lambda is triggered by each SQS message and processes messages in first in first out order and only-once (messages are deleted from the queue after successfully being processed). A message involving an outside collaborator is processed to determine if there is an existing ticket for that collaborator in the Spoke queue, and either a new ticket is created or the existing ticket is updated with the new information.

An expiration date is set for one year from the date a new collaborator is added. Collaborator access will automatically expire on this date if an extension is not requested. Collaborator access will also expire after a period of inactivity. Notifications will be sent to the person who added the collaborator prior to expiration of access.

## Flowchart of CLS operations

![CLS architecture][1]

## Dependencies

- @mapbox/node-spoke npm module that provides a Node.js SDK for the Spoke REST API
- @mapbox/cloudfriend and @mapbox/secret-cloudfriend npm modules
  - Hookshot GitHub Lambda shortcut
  - Queue Lambda shortcut
  - CodeBuild Project shortcut
- AWS
  - Lambda
  - SQS
  - CloudFormation
  - Secrets Manager
  - CodeBuild
- Slack API
  - Spoke uses Slack extensively for notifications and user interaction
  - Slack notifications will be sent with options for extending collaborator access
  - Slack alerts are sent to IT when certain errors occur

## Service Accounts and Tokens

CLS uses a GitHub App in each of the orgs where collaborators are added: 

- `mapbox` org: `redacted`
- `mapbox-collab` org: `redacted`

CLS uses the following Okta/Spoke service account:

Name: `redacted`
Email: `redacted`

The API token associated with this account is used in all Spoke API calls made by CLS. Spoke API tokens must be associated with a user, only one token per user is possible, and the token has the same permissions as the associated user. The only way to generate or regenerate an API token is to log in to Spoke and go to the user profile API settings.

The service account in use is a team admin in the Collaborator Lifecycle Security Spoke team. It has no special permissions in Spoke beyond this team.

The process used to create the Spoke API token used for this service is as follows. This process requires admin access to Okta and Spoke.

- create Okta service account
- assign Spoke Okta tile to the service account
- sign in to Spoke with the service account
- generate an API token for the service account in user profile settings
- add the token to AWS Secrets Manager, to be referenced by the CLS stack
- add the service account as a team admin of the Collaborator Lifecycle Security Spoke team
- rotating the token requires signing in to the service account in Spoke and regenerating the token, then changing the secret value in Secrets Manager

[1]: https://user-images.githubusercontent.com/29611310/124981455-97215580-e003-11eb-85b1-c488c1de01a2.png
