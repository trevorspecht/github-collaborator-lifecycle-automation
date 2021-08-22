# GitHub Outside Collaborator Management

![codebuild-status][1]

This repository serves as a demonstration of work done by @trevorspecht (me) in 2021 as part of my job. I conceived, architected and coded this project entirely myself, so I wanted to be able to share the code here (with redactions/obfuscations) to demonstrate how I was able to create a complex production-ready service with many moving parts. As of August 2021 this service is in open beta testing internally.

My company uses [atSpoke][2] for internal help desk ticketing. This service, known internally as CLS, works by creating an atSpoke ticket after a repo admin provides an outside collaborator permissions on a private repository. The ticket and additional documentation tasks are assigned to the person who added the collaborator. This service replaces several automated and manual monitoring and documentation processes, reduces alarms and operational overhead, and streamlines the process for IT and repo admins. Outside collaborators can simply be added by repo admins and the action taken will be automatically documented. Each collaborator is assigned an expiration date after which their access will be automatically removed unless steps are taken to renew access.

When the outside collaborator accepts the invitation, a GitHub app sends a webhook payload to an AWS API Gateway HTTP endpoint, which is configured to invoke a Lambda function. That's just the beginning, so please see the [architecture documentation][3] for more details.


[1]: https://codebuild.us-east-1.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoieHkzb2tTUzkyY01rUWYvSExqdGlYbDQrMkhlc1BrUkFlMTVpd3FmSTVYNUxOUGcyMHpPSkJubERjbGFyODk4SzFJbUg1N0EzZHVzZ0xqNUxIVXN1RkJjPSIsIml2UGFyYW1ldGVyU3BlYyI6Ik1hc0VWYU1sL3drcFRYL1UiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=main

[2]: https://www.atspoke.com/

[3]: ./docs/architecture.md