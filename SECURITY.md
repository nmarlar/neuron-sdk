# Security

Never publish credentials, exploit details containing secrets, customer data or
private workspace definitions in issues. Use GitHub's private vulnerability
reporting for this repository when enabled. If the private reporting control is
unavailable, do not file sensitive details publicly; ask the repository maintainer
for a private reporting channel without including the vulnerability payload.

Use narrow per-user OAuth grants and protect token/state storage. Neuron's server
must independently enforce current permissions. Client validation is not a trust
boundary, and SDK access does not override workspace rights or business approvals.
