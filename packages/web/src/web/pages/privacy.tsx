import { LegalLayout, type LegalSection } from "../components/legal-layout";

const SECTIONS: LegalSection[] = [
  {
    heading: "What we collect",
    paragraphs: [
      "OrbitL only stores what it needs to run your workspace. There is no advertising profile and nothing is sold.",
    ],
    bullets: [
      "Account details — your name, email address and a hashed password, or the basic profile returned by Google, Apple or Microsoft if you sign in that way. We never see or store your social password.",
      "Study content you create — subjects, concepts, notes, flashcards, quizzes, assignments, focus sessions, group posts and reviews.",
      "Progress data — XP, level, streak, mastery scores and the timestamps behind them.",
      "Files you upload — stored in object storage and linked to your account.",
      "Basic product analytics — page views and anonymous usage counts, used to see which features get used.",
    ],
  },
  {
    heading: "How we use it",
    bullets: [
      "To render your dashboard, knowledge graph, insights and streak.",
      "To generate AI explanations, quizzes, flashcards, notes and coach insights from the content you point at.",
      "To send transactional email: confirming your address, resetting your password and — if you leave them on — daily streak reminders.",
      "To keep the service working and prevent abuse, including per-user rate limits on the AI features.",
    ],
  },
  {
    heading: "AI processing",
    paragraphs: [
      "AI features send the relevant part of your content (a concept name, a note, a topic, or a summary of your study statistics) to a third-party model provider through an AI gateway so a response can be generated. Only what a feature needs is sent — never your whole workspace.",
      "We do not use your content to train models. Providers process it to return a response under their own terms.",
    ],
  },
  {
    heading: "Sharing",
    paragraphs: [
      "We share data only with the infrastructure providers that run the product: hosting, the database, object storage for uploads, the AI gateway and its model providers, the email sender and the analytics collector. Each processes data on our behalf.",
      "Content you deliberately publish — a study group post or a public review — is visible to the people that feature is for. Everything else is private to your account.",
    ],
  },
  {
    heading: "Retention and deletion",
    paragraphs: [
      "Your data is kept while your account exists. Settings → Reset workspace deletes all of your study data immediately and irreversibly, resetting XP, level and streak to zero.",
      "To close the account itself, use Settings → Delete account. It asks for your password, then erases your login, profile, study data, group memberships and reviews immediately. Groups you own are removed for every member. Deletion is irreversible and there is no recovery window.",
    ],
  },
  {
    heading: "Security",
    paragraphs: [
      "Passwords are stored hashed, never in plain text. Sessions are cookie- or bearer-token based and every request that touches your data checks that session on the server. Password reset links are single-use and expire after an hour; email confirmation links expire after 24 hours.",
      "No system is perfectly secure. Use a unique password, and tell us if you think your account has been accessed by someone else.",
    ],
  },
  {
    heading: "Your rights",
    paragraphs: [
      "You can access and correct your data in the app, export it by copying your notes and content, delete all of it from Settings, turn off reminder email at any time, and delete the account itself from Settings → Delete account. Depending on where you live you may have additional statutory rights — we honour them regardless of jurisdiction.",
    ],
  },
  {
    heading: "Children",
    paragraphs: [
      "OrbitL is built for students but is not intended for children under 13. If you believe a child under 13 has created an account, contact us and we'll remove it.",
    ],
  },
  {
    heading: "Changes and contact",
    paragraphs: [
      "If this policy changes materially we'll say so in the app before the change takes effect. Questions, requests or complaints: privacy@orbitl.app.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated="16 August 2026"
      intro="This policy explains what OrbitL stores, why, who else touches it, and how to get rid of it. It is written to be read, not to be skipped."
      sections={SECTIONS}
    />
  );
}
