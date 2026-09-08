import { StudentProfile } from "@/types";

export const DemoProfiles: StudentProfile[] = [
  {
    id: "student-a",
    loginName: "StudentA",
    displayName: "StudentA",
    readingLevel: 2,
    readingLabel: "Beginning reader",
    voice: "Tiffany",
    voiceLocale: "en-US",
    description: "Short words, clear directions, and lots of encouragement.",
    avatarUrl: "",
    tools: ["Sound-it-out help", "Pronunciation support", "Word recognition"],
    systemPrompt:
      "Use simple, clear language for a Level 2 beginning reader. Focus on basic vocabulary, word recognition, pronunciation help, and warm encouragement. Give one small step at a time.",
  },
  {
    id: "student-b",
    loginName: "StudentB",
    displayName: "StudentB",
    readingLevel: 3,
    readingLabel: "Intermediate reader",
    voice: "Amy",
    voiceLocale: "en-GB",
    description: "Bigger vocabulary, comprehension clues, and story conversations.",
    avatarUrl: "",
    tools: ["Vocabulary clues", "Comprehension support", "Character and theme discussion"],
    systemPrompt:
      "Support a Level 3 intermediate reader with age-appropriate vocabulary explanations, reading comprehension questions, and brief discussions of characters and themes. Encourage the student to use evidence from the story.",
  },
];

export function getDemoProfile(profileId: string | null | undefined): StudentProfile | null {
  return DemoProfiles.find((profile) => profile.id === profileId) ?? null;
}