# dns-query-network - Shared Open Source Project - Open-Source Project

A lightweight DNS (Domain Name System) server and recursive resolver written in Node.js. It listens on a UDP port, intercepts DNS queries, resolves matching custom domains from a local JSON mapping file, and recursively forwards unknown domains to an upstream public DNS resolver (like `8.8.8.8`).

## Project Features

- **Zero dependencies**: Written entirely using native Node.js core modules (`dgram`, `fs`, `path`).
- **Binary Frame Processing**: Parses binary DNS query packets, extracts label components, and constructs compliant binary answer frames.
- **Custom Local Resolution**: Map user domains directly to local IP configurations (e.g. `myapp.test` to `127.0.0.1`) without modifying the system hosts file.
- **Recursive Forwarder**: Forwards queries for external domains to public upstream servers and relays the response back.
- **Rootless Binding**: Defaults to port `5353` for local testing so it can be run without root/admin privileges.

## Repository Layout

```text
dns-query-network/
├── package.json
├── src/
│   └── dns_server.js
├── tests/
│   └── dns_server.test.js
└── README.md
```

## Build instructions

Ensure Node.js (version 18 or later) is installed. There are no npm packages to install.

## Running the Project

### 1. Configure hosts mapping

Create a `hosts.json` file mapping domains to IP addresses:

```json
{
  "app.local": "127.0.0.1",
  "staging.local": "192.168.1.50"
}
```

### 2. Start the DNS Server

```bash
# Listen on default local testing port 5353
node src/dns_server.js

# Bind to standard DNS port 53 (requires administrator/root permissions)
node src/dns_server.js hosts.json 53
```

### 3. Query the Server

Use `nslookup` or `dig` to query your server:

```bash
# Querying local configuration
nslookup app.local 127.0.0.1 -port=5353

# Querying recursive upstream resolver (e.g. google.com)
nslookup google.com 127.0.0.1 -port=5353
```

Example output:
```text
Server:  UnKnown
Address:  127.0.0.1

Name:    app.local
Address:  127.0.0.1
```

## Running Tests

Run the test suite using Node.js's built-in test runner:

```bash
npm test
```
This tests label decoders and binary DNS A-record builders.

---
*Released under the MIT License by Sassywow.*
