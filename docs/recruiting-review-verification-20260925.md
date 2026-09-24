# Interview persistence and review verification

## Confirmed gaps

- Recruiting profiles showed human kit / six-dimension scores but omitted `interview.aiInterview` transcripts and analysis.
- The candidate list considered only six-dimension scores, so saved question scores / AI scores looked unrated.
- Final analysis rejected completed interviews, even with already-persisted candidate answers.
- Ending a video room does not automatically generate an AI score. Missing evidence must remain unscored.

## Changes

- Candidate profiles expose saved video transcripts with speaker, original wording, Chinese translation and separately labelled AI advisory analysis.
- No audio replay is claimed: this system persists transcripts, not raw audio recordings.
- Lists distinguish saved manual question scores, AI scores and saved answers pending analysis.
- Authorized recruiters may explicitly analyze persisted answers after the interview, without joining a video room again. Human scores are not overwritten.
- Pending automatic capture / translation, cancelled sessions, authorization changes and concurrent evidence changes remain guarded.

## Verification

- Full existing `npm run test:recruiting` passed before the changes, demonstrating the missing end-to-end coverage.
- Added profile / list tests for saved transcripts, translation, scores, candidate isolation and missing-analysis status.
- Added backend tests for completed-session review and cancelled-session refusal.
- Isolated real HTTP integration: completed interview review, actual server stop/restart, then re-read original, translation and score (239 integration checks).
- Browser on loopback: log in; open candidate; generate/update AI review through mocked provider; inspect original, Chinese translation and 8/10 synthetic score; refresh and reopen.
- Browser on loopback: enter question score 7 and a synthetic evidence note; save; refresh; reopen same kit; verify exact persisted value and note.
- Tests use temporary DATA_DIR, synthetic users/candidates, loopback providers and no production messages.

## Remaining acceptance limits

- No real two-device microphone / LiveKit / real OpenAI speech test was performed in this run. Synthetic and persistence tests do not prove real-device capture.
- The user has been asked which actual interview failed. The specific reported session must still be checked before declaring the entire interview workflow accepted.
- No unsaved past browser audio can be reconstructed from absent transcripts.
