// Approved patient-facing text. Every line must pass the voice rules (see src/patient/copy.test.ts)
// and be approved by Esme. Kept as .ts (not .json) so Vercel functions can import it (CLAUDE.md rule 10).

const phrases = {
  "version": "0.1-draft",
  "status": "DRAFT — every line must be approved by Esme against the impersonal-voice rules in CLAUDE.md before the demo.",
  "rules": [
    "Aluna is a tool, not a character: no 'I', no feelings, no emojis, no pet names.",
    "No verdicts, scores, praise or reassurance (no 'you're doing great', 'nothing to worry about').",
    "Every close points outward to real people: care team, group, partner/friend, Talking Therapies.",
    "Plain, calm, short."
  ],
  "opener": [
    "Hi {name}. {count} quick questions today. About a minute.",
    "Hi {name}. Today's check-in has {count} questions. About a minute.",
    "Hello {name}. {count} short questions from your practice team."
  ],
  "itemIntro": "Thinking about the past 7 days:",
  "item10Confirm": "You chose \"{answer}\". Is that right?",
  "notePrompt": "Anything you'd like your care team to know? This is optional.",
  "noteThanks": "Thanks. Your care team can read this.",
  "closeTitle": [
    "Thanks for checking in.",
    "That's today's check-in done.",
    "Check-in saved."
  ],
  "closeGroup": "{group}.",
  "closeNext": "Next check-in: {when}.",
  "closeOutward": [
    "If something's on your mind before then, your practice team is there to talk to.",
    "Talking to someone you trust — a partner, friend or family — can help between check-ins.",
    "You can contact your health visitor or GP practice at any time, not just at check-ins."
  ],
  "homeNone": "No check-in today.",
  "homeNext": "Next check-in: {when}.",
  "homeDue": "Today's check-in is ready.",
  "reminder": "Your check-in is ready when you have a minute.",
  "notEmergency": "Aluna is not an emergency service.",
  "aboutAluna": "Aluna is an automated check-in used by your practice. Your answers go to your care team.",
  "voiceOpener": "Here is today's check-in. Answer out loud, or tap. Say \"repeat\" to hear a question again.",
  "voiceOptionsIntro": "The answers are:",
  "voiceHeard": "You said: {answer}. Say \"next\", or \"change\".",
  "voiceNotClear": "Sorry, that wasn't clear. Please say one of the answers again, or tap it.",
  "voiceTapFallback": "Switching to tap. Choose your answer on the screen.",
  "voiceNoteIntro": "Anything you'd like your care team to know? Speak now, and say \"finish\" when you're done. Or say \"skip\".",
  "voiceSaving": "Saving.",
  "journalEmpty": "Your past check-ins will appear here.",
  "journalIntro": "What you have shared with your care team. Only you and your care team can see this.",
  "notifyPrompt": "Get a gentle reminder when a check-in is ready. One message per check-in, at most one follow-up.",
  "routinePrompt": "When is a good moment for a one-minute check-in?",
  "pushTitle": "Aluna",
  "pushPrompt": "Your check-in is ready. About a minute.",
  "crisisVoice": "Thank you for telling us. Help is available now. If you are in danger, call 9 9 9. Samaritans are free, day or night, on 1 1 6, 1 2 3. The numbers are on your screen.",
  "pushReminder": "Your check-in is still there when you have a minute."
}

export default phrases
