# Automatic interview notes

This is **consented, segmented audio transcription**, not continuous live captions
and not a stored audio recording. It is confined to the recruiting video room.

## Participant workflow

1. Each participant reads the recording/AI disclosure and chooses automatic
   recording or video-only when joining. Old manual-recording consent does not
   silently opt the participant into the new automatic mode.
2. Once the candidate and interviewer are in the room with the required consent,
   each browser automatically captures **its own microphone only**. The operator
   does not need to start or stop recording for each question.
3. The UI shows recording, microphone input, transcription progress and errors.
   Silent segments are skipped. AI-question audio tracks are not recording inputs.
4. Chinese, English and mixed-language answers are preserved as source text.
   Chinese translations are separate. Only candidate answers are evidence of
   candidate ability; interviewer speech and AI questions remain attributed.
5. Pause, withdraw consent and video-only participation remain available. Ending
   or generating the final analysis first requests final-segment saving; an unconfirmed
   save must not be silently presented as a complete transcript.
   Mid-interview follow-up suggestions use already saved text without pausing
   ongoing recording. Complete analysis never silently drops the earliest answers;
   oversized input returns a visible error while preserving the saved original.

## Boundaries

- Raw segments are transient browser/server memory, not application files or DB
  attachments. They are sent to the already configured OpenAI transcription
  provider; provider data handling remains subject to that service's policies.
- Attribution follows the authenticated participant session, not voice identity.
  Use separate microphones/headphones to reduce one participant's loudspeaker
  being picked up by another microphone.
- Closing a browser, losing a device or losing the page can destroy unsaved audio.
  The browser queue is bounded; visible save failures require attention.
- No new provider keys, service, candidate invitations or production recordings
  are created merely by deploying this feature.
- Synthetic route/MediaRecorder tests prove the application flow, not the user's
  actual Safari/device/network or real speech-recognition accuracy. A two-device
  consented microphone check remains necessary before a real interview.

## Regression checks

Run `npm run test:recruiting` using the repository's isolated fixtures. New auto
tests cover consent/version boundaries, per-session attribution, revocation,
idempotency, multilingual original text, microphone-only capture, silent segments,
bounded queues and final-save handling. Run `npm run test:portal-safety` as the
shared-server regression check. Verify live asset hashes as well as health after
deployment; a successful push alone is not a release verification.
