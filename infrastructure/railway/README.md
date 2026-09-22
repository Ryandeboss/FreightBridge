# Railway SFTPGo

Railway hosts the portfolio SFTP server used by the Midwest Carrier SFTP transport.

## Container

- Image: `ghcr.io/drakkan/sftpgo:2.7.x`
- SFTP internal port: `2022`
- Web Admin internal port: `8080`
- Persistent volume mount: `/var/lib/sftpgo`

SFTPGo's official Docker and initial-configuration docs describe the same default SFTP and Web Admin ports, and document environment-variable configuration:

- <https://docs.sftpgo.com/enterprise/docker/>
- <https://docs.sftpgo.com/Enterprise/initial-configuration/>
- <https://docs.sftpgo.com/enterprise/env-vars/>

## Railway Networking

Expose two Railway services or ports:

- TCP proxy to container port `2022` for SFTP traffic.
- HTTP Web Admin on container port `8080` for operator setup. Restrict this surface with Railway controls whenever possible.

Use Railway's generated TCP proxy host and external port in both backend services:

- `MWCX_SFTP_HOST`
- `MWCX_SFTP_PORT`

## Account Layout

Create one SFTPGo user for the synthetic Midwest exchange:

- Username: `mwcx_freightbridge`
- Authentication: SSH public key only.
- Home directory: SFTPGo-managed home under the persistent volume.
- Required directories: `/inbound`, `/outbound`, `/archive`, `/error`

Disable password login for this user. Store only the public key in SFTPGo. Store the private key only in Render or local `.env` files that are not committed.

## FreightBridge Variables

Configure both `services/freightbridge-api` and `services/midwest-partner-sim`:

```text
MWCX_SFTP_HOST=<railway-tcp-proxy-host>
MWCX_SFTP_PORT=<railway-tcp-proxy-port>
MWCX_SFTP_USERNAME=mwcx_freightbridge
MWCX_SFTP_PRIVATE_KEY_B64=<base64-private-key>
MWCX_SFTP_HOST_KEY_SHA256=<server-host-key-sha256>
```

Private keys, host keys, Railway tokens, and generated credentials must stay in Railway/Render secret stores or uncommitted local `.env` files.
