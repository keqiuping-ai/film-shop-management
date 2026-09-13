# QUAD Meta Webhook and App Review Checklist

This checklist prepares the Meta app review. It does not authorize submitting the review or changing production credentials.

## Confirmed app assets

- App: `Quad Film Lead CRM`
- App ID: `1540802224215324`
- Facebook Page: `QD Auto Image`
- Page ID: `730738313459205`
- Production callback: `https://film-shop-management-production.up.railway.app/api/meta/webhook`
- Privacy policy: `https://quadfilmus.com/privacy-policy/`
- Terms: `https://quadfilmus.com/sms-terms/`

## Webhook configuration

Use the same production callback and the existing verify token for both objects.

### Page object

- `messages`
- `messaging_postbacks`
- `leadgen`

### Instagram object

- `messages`
- Any delivery/read fields required by the final reviewer test flow

Keep the legacy QUAD paths active during migration:

- `/api/meta/messenger/webhook`
- `/api/meta/lead-ads/webhook`

Both legacy paths dispatch through the same unified parser, so changing the Meta callback does not need to be simultaneous with deployment.

## Permissions to request

Instagram messaging also requires `instagram_basic` as a prerequisite. Include it in the review/access request together with the three messaging and Webhook permissions below.

Current Meta Developers preparation status (2026-09-12):

- `pages_messaging`: added, status `Ready for testing`
- `pages_manage_metadata`: added, status `Ready for testing`
- `instagram_basic`: added, status `Ready for testing`
- `instagram_manage_messages`: added, status `Ready for testing`
- Final review has not been submitted.
- Instagram Page authorization and callback configuration are still pending deployment and a real end-to-end test.

### `pages_messaging`

QUAD staff use the customer communication center to receive customer messages sent to the QD Auto Image Facebook Page and to send a staff-confirmed reply. The permission is not used for unsolicited messages.

Reviewer demonstration:

1. Send a new message from a non-role Facebook account to QD Auto Image.
2. Open QUAD and sign in with a reviewer account that has customer communication access.
3. Open Customer Communication Center and show the new inbound message, customer identity, timestamp, and Meta channel.
4. Type a reply, confirm it manually, and send it.
5. Show the reply in Facebook Messenger and in the QUAD conversation history.

### `pages_manage_metadata`

QUAD needs this permission to subscribe the QD Auto Image Page to Page Webhook fields and continuously receive Page messaging and lead events. QUAD does not use it to alter unrelated Page content.

Reviewer demonstration:

1. Show the Meta Page subscription for QD Auto Image.
2. Send a Page message or Meta test event.
3. Show the event arriving at the unified QUAD callback and appearing in Customer Communication Center.

### `instagram_manage_messages`

QUAD staff use the same customer communication center to receive and respond to direct messages sent to the Instagram professional account connected to QD Auto Image. Replies remain human-confirmed.

Reviewer demonstration:

1. Send a DM from a non-role Instagram account to the connected professional account.
2. Open the corresponding conversation in QUAD and show the `Meta / Instagram` source.
3. Send a staff-confirmed reply from QUAD.
4. Show the reply in Instagram and in QUAD history.

## Evidence to capture before submission

- One continuous, narrated screen recording for each permission.
- The Facebook Page and Instagram professional account names visible in the recording.
- A fresh inbound message created during the recording; do not rely on historical messages.
- QUAD receiving the message without a manual refresh or manual import.
- A reply sent from QUAD and received by the same Meta account.
- Webhook delivery status and HTTP response for the demonstrated event.
- Reviewer login instructions and a least-privilege test employee account; never put owner credentials or secrets in the submission text.
- English descriptions and UI language where practical for the reviewer.

## Pre-submission gates

- Deploy and verify the unified endpoint first.
- Configure the Page callback to `/api/meta/webhook` and confirm `messages`, `messaging_postbacks`, and `leadgen` remain subscribed.
- Connect the Instagram professional account, authorize its Page, configure the Instagram callback, and subscribe `messages`.
- Confirm the Page Access Token belongs to Page `730738313459205` and is not expired.
- Confirm App Secret signature validation is enabled.
- Verify a real Facebook message, a real Instagram DM, and a Lead Ads test lead independently.
- Confirm duplicate delivery does not create duplicate customer records.
- Check that Railway logs contain no `403` or `500` responses during the demonstrations.
- Only then open the final Meta review submission screen.
