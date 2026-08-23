import dgram from 'node:dgram';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Parses DNS question labels into a domain name (e.g. "\x03www\x06google\x03com\x00" -> "www.google.com")
export fn parseDomain(buffer, offset = 12) {
  const labels = [];
  let curr = offset;
  
  while (curr < buffer.length && buffer[curr] > 0) {
    const len = buffer[curr];
    if (curr + 1 + len > buffer.length) {
      throw new Error('Malformed DNS packet label length');
    }
    const label = buffer.toString('utf8', curr + 1, curr + 1 + len);
    labels.push(label);
    curr += 1 + len;
  }
  
  return {
    domain: labels.join('.'),
    nextOffset: curr + 1 // Advance past the terminating zero byte
  };
}

// Builds a standard DNS response A-record packet for IPv4 (e.g. "127.0.0.1")
export fn buildResponse(queryBuffer, ipAddress) {
  const transactionId = queryBuffer.subarray(0, 2);
  
  // Header configuration: 
  // Flags: 0x8180 (Standard Query Response, No error, Recursion desired + available)
  // Questions: 1, Answers: 1, Authority: 0, Additional: 0
  const header = Buffer.from([
    transactionId[0], transactionId[1],
    0x81, 0x80, // Flags
    0x00, 0x01, // QDCOUNT = 1
    0x00, 0x01, // ANCOUNT = 1
    0x00, 0x00, // NSCOUNT = 0
    0x00, 0x00  // ARCOUNT = 0
  ]);

  // Find end of Question section to copy it.
  // Starting at offset 12, find where the name ends
  const { nextOffset } = parseDomain(queryBuffer, 12);
  const questionSectionEnd = nextOffset + 4; // Add 2 bytes QTYPE and 2 bytes QCLASS
  const questionSection = queryBuffer.subarray(12, questionSectionEnd);

  // Parse IP Address into bytes
  const ipBytes = ipAddress.split('.').map((num) => parseInt(num, 10));
  if (ipBytes.length !== 4 || ipBytes.some(isNaN)) {
    throw new Error(`Invalid IP address format: ${ipAddress}`);
  }

  // Answer Section layout (Resource Record):
  // Offset reference to question name: 0xc00c (offset 12)
  // Type: A (0x0001), Class: IN (0x0001), TTL: 60s (0x0000003c), RDLength: 4 (0x0004), RData: IP (4 bytes)
  const answer = Buffer.from([
    0xc0, 0x0c,             // Pointer to domain name (Offset 12)
    0x00, 0x01,             // Type = A
    0x00, 0x01,             // Class = IN
    0x00, 0x00, 0x00, 0x3c, // TTL = 60 seconds
    0x00, 0x04,             // RDLength = 4 bytes
    ipBytes[0], ipBytes[1], ipBytes[2], ipBytes[3] // RData (IP)
  ]);

  return Buffer.concat([header, questionSection, answer]);
}

// Creates the socket server
export fn createDnsServer(hosts, upstreamDns = '8.8.8.8', upstreamPort = 53) {
  const server = dgram.createSocket('udp4');

  server.on('message', (msg, rinfo) => {
    try {
      if (msg.length < 12) return; // Ignore tiny packets
      
      const { domain } = parseDomain(msg, 12);
      const cleanDomain = domain.toLowerCase();

      console.log(`Query: ${cleanDomain} from ${rinfo.address}:${rinfo.port}`);

      if (hosts[cleanDomain]) {
        // Resolve using local hosts rules
        const ip = hosts[cleanDomain];
        console.log(`  -> Local Hit: ${cleanDomain} = ${ip}`);
        const responsePacket = buildResponse(msg, ip);
        server.send(responsePacket, rinfo.port, rinfo.address, (err) => {
          if (err) console.error(`Error sending response to ${rinfo.address}:`, err);
        });
      } else {
        // Recursive forwarder resolver
        console.log(`  -> Forwarding to ${upstreamDns}:${upstreamPort}`);
        const client = dgram.createSocket('udp4');
        
        const timeout = setTimeout(() => {
          console.error(`  -> Timeout forwarding query for ${cleanDomain}`);
          client.close();
        }, 3000);

        client.on('message', (upstreamMsg) => {
          clearTimeout(timeout);
          server.send(upstreamMsg, rinfo.port, rinfo.address, (err) => {
            if (err) console.error(`Relay error:`, err);
          });
          client.close();
        });

        client.on('error', (err) => {
          clearTimeout(timeout);
          console.error('Upstream client socket error:', err.message);
          client.close();
        });

        client.send(msg, upstreamPort, upstreamDns, (err) => {
          if (err) {
            clearTimeout(timeout);
            console.error('Failed to forward packet to upstream:', err);
            client.close();
          }
        });
      }
    } catch (err) {
      console.error('Error processing DNS request packet:', err.message);
    }
  });

  server.on('error', (err) => {
    console.error('DNS Server socket error:', err);
  });

  return server;
}

// Direct CLI initialization
async function run() {
  const args = process.argv.slice(2);
  const hostsPath = args[0] ? path.resolve(args[0]) : path.join(process.cwd(), 'hosts.json');
  const port = parseInt(args[1], 10) || 5353; // Use 5353 locally by default so root permissions aren't required

  console.log(`Loading hosts mapping from: ${hostsPath}`);

  let hosts = {};
  try {
    const data = await fs.readFile(hostsPath, 'utf8');
    hosts = JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('No hosts file found. Generating default hosts.json...');
      hosts = {
        'my-local-app.test': '127.0.0.1',
        'api.local.test': '192.168.1.100'
      };
      await fs.writeFile(hostsPath, JSON.stringify(hosts, null, 2), 'utf8');
    } else {
      console.error(`Error loading hosts.json: ${err.message}`);
      process.exit(1);
    }
  }

  const server = createDnsServer(hosts, '8.8.8.8', 53);
  server.bind(port, () => {
    console.log(`\nMicro DNS Server successfully listening on UDP port ${port} 📡\n`);
  });
}

const isDirectRun = process.argv[1] && (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1].endsWith('dns_server.js') ||
  process.argv[1].endsWith('index.js')
);

if (isDirectRun) {
  run().catch((err) => {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  });
}
