/** Human-readable names for achievement keys returned by the XP engine. */
const TITLES: Record<string, string> = {
  first_note: "First Note",
  first_assignment: "First Assignment",
  first_quiz: "Quiz Rookie",
  quiz_master: "Quiz Master",
  flash_100: "Card Shark",
  streak_7: "On Fire",
  streak_30: "Unstoppable",
  focus_10: "Deep Worker",
  level_5: "Rising Scholar",
  level_10: "Semester Champion",
  graph_builder: "Graph Builder",
  note_10: "Note Taker",
  note_50: "Archivist",
  streak_3: "Warming Up",
  streak_14: "Fortnight Focus",
  streak_100: "Centurion",
  level_20: "Dean’s List",
  level_30: "Polymath",
  quiz_10: "Quiz Regular",
  quiz_50: "Exam Ready",
  perfect_5: "Flawless Five",
  flash_500: "Memory Machine",
  focus_50: "Focus Veteran",
  focus_hours_10: "Ten Hours Deep",
  focus_hours_50: "Fifty Hours Deep",
  deep_focus: "Laser Locked",
  reflector: "Reflective Learner",
  assignment_done: "Task Slayer",
  assignment_10: "Deadline Crusher",
  subject_5: "Well Rounded",
  mastered_1: "Concept Cracked",
  mastered_10: "Domain Expert",
  linked_10: "Web Weaver",
  group_joined: "Study Buddy",
  reviewer: "Voice Heard",
};

export function achievementTitle(key: string) {
  return TITLES[key] ?? key.replace(/_/g, " ");
}

export function achievementList(keys: string[]) {
  return keys.map(achievementTitle).join(", ");
}
