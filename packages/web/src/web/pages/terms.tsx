import { LegalLayout, type LegalSection } from "../components/legal-layout";

const SECTIONS: LegalSection[] = [
  {
    heading: "The agreement",
    paragraphs: [
      "By creating an OrbitL account or using the service you accept these terms. If you don't agree with them, don't use OrbitL.",
    ],
  },
  {
    heading: "Your account",
    bullets: [
      "You must give a real email address and keep your password to yourself.",
      "You are responsible for everything that happens under your account.",
      "One account per person. Don't share credentials.",
      "You must be at least 13 years old.",
    ],
  },
  {
    heading: "Acceptable use",
    paragraphs: ["Don't do any of the following:"],
    bullets: [
      "Upload content that is illegal, infringing, malicious or abusive to other people in a study group.",
      "Try to break, overload, scrape or reverse-engineer the service, or work around the per-user AI rate limits.",
      "Use the AI features to cheat where your institution forbids it. OrbitL is built to help you understand work, not to submit machine-written work as your own — that's between you and your school, and it's your responsibility.",
      "Resell or redistribute the service or its AI output as your own product.",
    ],
  },
  {
    heading: "Your content",
    paragraphs: [
      "You keep ownership of everything you put into OrbitL. You grant us only the licence needed to store, process and display it back to you and to the people you deliberately share it with, including sending the relevant part to AI providers when you use an AI feature.",
      "You confirm you have the right to upload what you upload.",
    ],
  },
  {
    heading: "AI output",
    paragraphs: [
      "AI explanations, quizzes, flashcards, generated notes and coach insights are produced by language models and can be wrong, incomplete or out of date. Check anything that matters against your course material. Nothing OrbitL generates is academic, legal, medical or financial advice.",
    ],
  },
  {
    heading: "Availability and changes",
    paragraphs: [
      "The service is provided as-is. We may change, add or remove features, and there may be downtime for maintenance or reasons outside our control. AI features depend on third-party providers and may be limited or unavailable.",
    ],
  },
  {
    heading: "Termination",
    paragraphs: [
      "You can stop using OrbitL at any time, wipe your data from Settings, or ask us to delete your account. We may suspend or close an account that breaks these terms, or that is used to harm the service or other users.",
    ],
  },
  {
    heading: "Liability",
    paragraphs: [
      "To the extent the law allows, OrbitL is not liable for indirect or consequential losses, lost data, missed deadlines, or academic outcomes. Nothing here limits liability that cannot legally be limited.",
    ],
  },
  {
    heading: "Contact",
    paragraphs: [
      "Questions about these terms: support@orbitl.app. If we change them materially we'll tell you in the app before the change takes effect.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      updated="16 August 2026"
      intro="The rules for using OrbitL — what you can expect from us, what we expect from you, and the limits on both."
      sections={SECTIONS}
    />
  );
}
