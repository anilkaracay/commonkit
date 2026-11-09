# sputnikdao2.wasm — provenance

- File: `sputnikdao2.wasm` (539,647 bytes)
- sha256 (hex): `880bae9a58c99ec1efe8b10cf834b3f0c0ebc7a05d71206f3c1202c4280952da`
- NEAR code_hash (base58 sha256): `AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH`
- Obtained 2026-11-09 via testnet RPC `query {request_type: "view_code", account_id: "sharkco-owners.sputnikv2.testnet"}` (block 276914883).
- This is the **current default code** of the testnet factory `sputnikv2.testnet` (`get_default_code_hash` → `AA4nA45v…`; `get_contracts_metadata` lists it as version [3,31], commit `7764926cfd3c47f62b5fcde231c251f3c3892887`). Every DAO created from the factory today runs exactly this code; `version()` returns `"2.3.1"`.
- The binary embeds `near-sdk-4.0.0-pre.7` paths, i.e. it is the pre-2025 Sputnik v2 line. The closest public source is https://github.com/near-daos/sputnik-dao-contract at commit `3d568f9` (2024-09-25, `sputnikdao2` v2.3.1, near-sdk 4.0.0-pre.7 in Cargo.lock). The factory's recorded commit `7764926…` is not present in the public repository.
- Init: `new({config: {name, purpose, metadata: ""}, policy: [<council accounts>]})` (or a full `Policy` object).

Re-fetch / verify:

```bash
curl -s https://rpc.testnet.near.org -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_code","finality":"final","account_id":"sharkco-owners.sputnikv2.testnet"}}' \
  | python3 -c 'import sys,json,base64;open("sputnikdao2.wasm","wb").write(base64.b64decode(json.load(sys.stdin)["result"]["code_base64"]))'
shasum -a 256 sputnikdao2.wasm
```
