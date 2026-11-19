# Security Specification & Red-Team Invariants

## 1. Data Invariants
1. **Default-Deny Safety Net**: Every unspecified path in `/databases/{database}/documents` is rejected (`allow read, write: if false`).
2. **Owner-Isolated Profiles (`users/{userId}`)**: A standard verified user can only `get`, `create`, `update`, or `delete` their own profile document (`request.auth.uid == userId`), and `list` is prohibited for standard users to prevent profile enumeration. Verified app owner (`email_verified == true && email == 'aneeksinha52@gmail.com'`) has full read/write oversight while preserving strict schema validation.
3. **Owner-Scoped Chats (`chats/{chatId}`)**: Every chat session is bound to an immutable `userId`. Standard verified users can access only records matching `userId == request.auth.uid`; the verified app owner has full workspace access across sessions.
4. **Master-Gated Messages (`chats/{chatId}/messages/{messageId}`)**: Access to messages requires fetching the parent `/chats/{chatId}` document and verifying `userId == request.auth.uid` (or `isAppOwner()`) as well as `incoming().chatId == chatId`.
5. **Immutable Usage Telemetry (`usageLogs/{logId}`)**: Standard verified users can create and read/delete only their own usage logs; `userId` and `createdAt` cannot be forged or backdated (`createdAt == request.time`). Verified app owner retains full oversight access.
6. **Verified Owner Spoof Guard**: Elevated owner privileges require both `request.auth.token.email_verified == true` and exact `request.auth.token.email == 'aneeksinha52@gmail.com'`.
7. **Owner-Controlled Unlimited Access Allowlist (`unlimitedGrants/{grantId}`)**: Only the verified app owner (`isAppOwner()`) can `create`, `update`, `delete`, or broadly `list` granted email records. Standard verified users may query/read only a grant whose normalized `email` matches `request.auth.token.email.lower()`, preventing email enumeration and self-granting escalation.

## 2. Adversarial Test Payloads ("Dirty Dozen")
1. **Shadow Field Injection on Profile**: Creating `/users/u1` with an extra `isAdmin: true` key -> Rejected by `data.keys().hasOnly(...)`.
2. **Identity Spoofing on Chat Create**: Authenticated user `u1` creating `/chats/c1` with `userId: "u2"` -> Rejected by `data.userId == request.auth.uid`.
3. **Unverified Email Owner Spoof**: Authenticated user with `email: "aneeksinha52@gmail.com"` and `email_verified: false` attempting access -> Rejected by `isVerifiedUser()` inside `isAppOwner()`.
4. **Path ID Poisoning**: Creating `/chats/invalid id with spaces!` or 500-char ID -> Rejected by `isValidId(chatId)`.
5. **Backdated Timestamp Forge**: Creating `/usageLogs/l1` with client-supplied past `createdAt` -> Rejected by `incoming().createdAt == request.time`.
6. **Immutable Owner Reassignment**: Updating `/chats/c1` to change `userId` -> Rejected by `incoming().userId == existing().userId` and `affectedKeys().hasOnly(...)`.
7. **Oversized Content Exhaustion**: Writing `/chats/c1/messages/m1` with `content` > 50,000 chars -> Rejected by `data.content.size() <= 50000`.
8. **Invalid Role Enum Injection**: Writing `/chats/c1/messages/m1` with `role: "system"` -> Rejected by `data.role in ['user', 'assistant']`.
9. **Parent Mismatch Orphan Message**: Writing `/chats/c1/messages/m1` with `chatId: "c2"` -> Rejected by `incoming().chatId == chatId`.
10. **Cross-Tenant Message Injection**: User `u2` writing into `/chats/c1/messages/m1` where `/chats/c1` belongs to `u1` -> Rejected by Master Gate `get(/databases/$(database)/documents/chats/$(chatId)).data.userId == request.auth.uid`.
11. **Self-Grant Unlimited Privilege Escalation**: Non-owner user attempting to create or list all documents in `/unlimitedGrants` -> Rejected by `isAppOwner()` and `resource.data.email == request.auth.token.email.lower()`.
12. **Negative Token Forgery**: Writing `/usageLogs/l1` with `totalTokens: -500` -> Rejected by `data.totalTokens >= 0`.
