---
title: "OpenAPI 3.2: Display oauth2MetadataUrl in the built-in dashboard"
parentIssue: 1673
labels:
  - enhancement
  - openapi-3.2
assignees: []
milestone:
---

OpenAPI 3.2 adds an `oauth2MetadataUrl` field to the OAuth2 Security Scheme. This field provides the URL of the authorisation server's metadata document per [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414), helping developers configure OAuth2 clients.

## Current state

The built-in dashboard (`src/client/`) does not display any metadata about security schemes defined in the spec.

## Proposed changes

- In the built-in dashboard templates (`src/client/`), read the `oauth2MetadataUrl` field from each OAuth2 Security Scheme in the spec
- Display this URL in the security section of the dashboard so developers can easily locate the authorisation server's metadata document when configuring OAuth2 clients against the mock server

## Acceptance criteria

- [ ] A spec with an OAuth2 security scheme that has `oauth2MetadataUrl` displays the URL in the dashboard
- [ ] The dashboard renders correctly when `oauth2MetadataUrl` is absent (no regression)
- [ ] The displayed URL is a clickable link
- [ ] The change does not affect server behaviour — only the UI rendering
