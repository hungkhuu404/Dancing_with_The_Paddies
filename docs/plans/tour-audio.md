# MIG-TOUR-AUDIO-004

Human owner: Quoc. Actor: Codex. Branch: migration/tour-audio, based on destination origin/main e0849a9. Consumer: the product frontend. Source: Nasa_prep main 2cc00f4783f5d6b6bf256b432b6916ee75049a95, merged PR #19. [Per-file provenance](../provenance/tour-audio.md).

## Scope and modules

- world/tourScript.js and tourAudio.js: fifteen short caption cues, five static ElevenLabs Jon clips, aligned cue starts and voice lifecycle handling.
- world/tourScore.js: original five-scene music in a register suited to small speakers, 32 scheduled notes, scene-entry accents, speech ducking and shared tour-audio mute. No music service or sample dependency.
- world/signature.js and ui/surfaces.css: lower one-line subtitles without a box, separate final calendar preview, stop/hidden-tab behaviour and compact audio controls. Recorder captions use the same cue; video export still has no audio mix.
- world/sound.js: stereo procedural ambience, softer insects, peak control, narration ducking and completed-node cleanup. This is illustration, not data sonification or a field recording.
- calendar/index.html, method/index.html, index.html and ui/chrome.js: independent reference destinations without cross-links; Method appears beneath Water calendar in the landscape.
- public/audio/tour/: five MP3s totalling 525,588 bytes plus the source/voice/settings/timing/hash manifest. tools/build-tour-voice.mjs is an explicit optional generation tool; it requires an external key file and an empty staging directory. It is never run by build, CI or the browser. No credentials or generation calls are part of this migration.
- test/tourAudio.test.mjs and tourScore.test.mjs: caption boundaries, playback/mute/error/exit, missing-asset fallback, binary hashes and five-scene score scheduling/cleanup.

## Boundaries and completion

The import is selected Git blobs, not an old commit history. Destination README, licence, CONTRACT-001, pipeline, H4/H5 public data, export allowlist, dependency files and CI stay unchanged. The source checkout remains unchanged. No hosting/deploy pipeline is imported. Completion requires destination tests/build, public-data integrity checks, a browser run with the destination build, exact import hashes and a green product CI on a PR to main. Merge is left to review; no auto-merge or deployment is configured.

## Verification

Destination web tests and production build pass. All 28 committed public inputs and both data outputs match byte for byte, including H5. Edge confirms independent reference navigation, single-line captions on desktop/phone/landscape, the real 480-cell final calendar, all five actual voice clips over a full minute, 32 scheduled score notes with cleanup, mute, Escape and no application exceptions. Screenshots were inspected. Owned test browsers and server are closed. Source and target file hashes match the provenance manifest. Product PR CI is still pending. Subjective voice delivery, local-name pronunciation and musical balance remain for human listening review. Bang Rakam observations, H7 and data sonification remain outside this task.
