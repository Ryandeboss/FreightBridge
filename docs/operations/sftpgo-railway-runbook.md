# SFTPGo Railway Runbook

This runbook configures the synthetic Midwest Carrier SFTP transport used by Milestone 11.

## References

- SFTPGo Docker: <https://docs.sftpgo.com/enterprise/docker/>
- SFTPGo initial configuration: <https://docs.sftpgo.com/Enterprise/initial-configuration/>
- SFTPGo environment variables: <https://docs.sftpgo.com/enterprise/env-vars/>
- SFTPGo Web Admin: <https://docs.sftpgo.com/enterprise/web-interfaces/>

## Railway Service

Create a Railway service from the container image:

```text
ghcr.io/drakkan/sftpgo:2.7.x
```

Configure a persistent volume mounted at:

```text
/var/lib/sftpgo
```

Expose:

- SFTP: container port `2022` through Railway TCP proxy.
- Web Admin: container port `8080`.

SFTPGo's default configuration enables SFTP on port `2022`; its Web Admin runs on port `8080` unless changed. The container can be customized with SFTPGo environment variables.

## SFTPGo User

In the Web Admin, create:

```text
Username: mwcx_freightbridge
Authentication: public key only
Home directory: SFTPGo-managed user home
```

Create these directories in that user home:

```text
/inbound
/outbound
/archive
/error
```

Directory meaning:

- `/inbound`: FreightBridge writes X12 204 files for Midwest.
- `/outbound`: Midwest writes X12 990 and 214 files for FreightBridge.
- `/archive`: Successfully consumed files.
- `/error`: Deterministically rejected files.

## Windows Key Generation

Generate a dedicated Ed25519 key:

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\freightbridge_mwcx_sftp -C "freightbridge-mwcx-sftp"
```

Copy the public key into SFTPGo:

```powershell
Get-Content $env:USERPROFILE\.ssh\freightbridge_mwcx_sftp.pub
```

Base64-encode the private key for Render:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.ssh\freightbridge_mwcx_sftp"))
```

Do not commit the private key or the base64 value.

## Host-Key Fingerprint

Fetch the host key from Railway's TCP proxy, using the Railway external SFTP port:

```powershell
ssh-keyscan -p <railway-sftp-port> <railway-sftp-host> | Set-Content .\sftpgo_host_key.pub
ssh-keygen -l -E sha256 -f .\sftpgo_host_key.pub
```

Use the `SHA256:...` value as:

```text
MWCX_SFTP_HOST_KEY_SHA256
```

FreightBridge verifies the server host key before authentication and does not use Paramiko `AutoAddPolicy`.

## Render Variables

Set the same SFTP values on both Render services:

- `services/freightbridge-api`
- `services/midwest-partner-sim`

```text
MWCX_SFTP_HOST=<railway-tcp-proxy-host>
MWCX_SFTP_PORT=<railway-tcp-proxy-port>
MWCX_SFTP_USERNAME=mwcx_freightbridge
MWCX_SFTP_PRIVATE_KEY_B64=<base64-private-key>
MWCX_SFTP_HOST_KEY_SHA256=<SHA256:...>
```

Keep the existing REST harness variables because the REST endpoints remain available for regression testing.

## Readiness

After both services redeploy, check:

```http
GET {{freightbridgeBaseUrl}}/api/integrations/midwest/sftp/readiness
GET {{midwestBaseUrl}}/v1/sftp/readiness
```

Expected:

```json
{
  "status": "ready",
  "transport": "SFTP"
}
```

If either service returns `not_ready`, verify the Railway TCP proxy host/port, private key, SFTPGo user public key, and host-key fingerprint.

## Manual LOAD502 Acceptance

1. Create or seed `LOAD502` in FreightBridge through the existing Apex load-tender flow.
2. Dispatch the 204 over SFTP:

```http
POST {{freightbridgeBaseUrl}}/api/integrations/midwest/load-tenders/LOAD502/dispatch-sftp
```

Expected: `202`, `transport` is `SFTP`, and `midwest.remotePath` is `/inbound/APEX_MWCX_204_<control>.edi`.

3. Poll Midwest inbound SFTP:

```http
POST {{midwestBaseUrl}}/v1/sftp/inbound/poll
Authorization: Bearer {{midwestBearerToken}}
```

Expected: `processed` includes the 204 file and SFTPGo shows it moved from `/inbound` to `/archive`.

4. Verify Midwest owns the pending load:

```http
GET {{midwestBaseUrl}}/v1/loads/LOAD502
Authorization: Bearer {{midwestReadonlyToken}}
```

Expected: `tenderStatus` is `PENDING`.

5. Accept the tender:

```http
POST {{midwestBaseUrl}}/v1/loads/LOAD502/tender-decisions
Authorization: Bearer {{midwestBearerToken}}
Content-Type: application/json

{
  "decision": "ACCEPTED"
}
```

6. Dispatch the generated 990 over SFTP:

```http
POST {{midwestBaseUrl}}/v1/loads/LOAD502/tender-response/dispatch-sftp
Authorization: Bearer {{midwestBearerToken}}
```

Expected: `202` and `remotePath` is `/outbound/MWCX_APEX_990_<control>.edi`.

7. Poll FreightBridge outbound SFTP:

```http
POST {{freightbridgeBaseUrl}}/api/integrations/midwest/sftp/outbound/poll
```

Expected: `processed` includes the 990 file and SFTPGo shows it moved from `/outbound` to `/archive`.

8. Verify Apex tender status:

```http
GET {{apexBaseUrl}}/v1/loads/LOAD502/tender-status
Authorization: Bearer {{apexReadonlyToken}}
```

Expected: latest Midwest tender response is `ACCEPTED`.

## Deterministic Error Checks

- Put malformed `.edi` files in `/inbound` or `/outbound`.
- Run the matching poll endpoint.
- Expected: the bad file moves to `/error`.

Transient SFTP connection, authentication, and host-key failures do not move files to `/error`; they leave files in place for retry after configuration is repaired.
