import { lazy, Suspense, useRef, useState } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { Provider } from "./components/provider";
import { AgentFeedback, RunableBadge } from "@runablehq/website-runtime";
import { AppShell } from "./components/layout/app-shell";
import { authClient } from "./lib/auth";
import { useStatus } from "./queries/me";
import { OnboardingTour } from "./components/onboarding";
import { Skeleton } from "./components/ui/skeleton";
import { ErrorBoundary } from "./components/error-boundary";
import { VerifyEmailBanner } from "./components/verify-email-banner";

import LoginPage from "./pages/login";
import HomePage from "./pages/home";

/**
 * Route-level code splitting. Only the shell, the marketing landing page and
 * the sign-in screen ship in the entry bundle; every other page — including the
 * chart-heavy dashboard — is fetched on navigation, so a first-time visitor
 * never downloads the whole app.
 */
const DashboardPage = lazy(() => import("./pages/dashboard"));
const GraphPage = lazy(() => import("./pages/graph"));
const SubjectsPage = lazy(() => import("./pages/subjects"));
const SubjectDetailPage = lazy(() => import("./pages/subject-detail"));
const NotesPage = lazy(() => import("./pages/notes"));
const NotePage = lazy(() => import("./pages/note-page"));
const FlashcardsPage = lazy(() => import("./pages/flashcards"));
const QuizzesPage = lazy(() => import("./pages/quizzes"));
const QuizPlayPage = lazy(() => import("./pages/quiz-play"));
const AssignmentsPage = lazy(() => import("./pages/assignments"));
const FocusPage = lazy(() => import("./pages/focus"));
const InsightsPage = lazy(() => import("./pages/insights"));
const GroupsPage = lazy(() => import("./pages/groups"));
const GroupDetailPage = lazy(() => import("./pages/group-detail"));
const AchievementsPage = lazy(() => import("./pages/achievements"));
const SettingsPage = lazy(() => import("./pages/settings"));
const AdminPage = lazy(() => import("./pages/admin"));
const ReviewsPage = lazy(() => import("./pages/reviews"));
const ForgotPasswordPage = lazy(() => import("./pages/forgot-password"));
const ResetPasswordPage = lazy(() => import("./pages/reset-password"));
const NotFoundPage = lazy(() => import("./pages/not-found"));
const JoinPage = lazy(() => import("./pages/join"));
const PrivacyPage = lazy(() => import("./pages/privacy"));
const TermsPage = lazy(() => import("./pages/terms"));

function BootScreen() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

/**
 * Shows the welcome tutorial once, on first sign-in. Accounts start empty —
 * no data is seeded automatically.
 */
function OnboardingGate() {
  const status = useStatus();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (!status.data || status.data.onboarded) return null;

  return <OnboardingTour onDone={() => setDismissed(true)} />;
}

/** Lightweight placeholder while a lazily-loaded route chunk arrives. */
function RouteFallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-1">
      <Skeleton className="h-10 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function AuthedApp() {
  return (
    <>
      <OnboardingGate />
      <AppShell>
        <VerifyEmailBanner />
        <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/graph" component={GraphPage} />
          <Route path="/subjects" component={SubjectsPage} />
          <Route path="/subjects/:id" component={SubjectDetailPage} />
          <Route path="/notes" component={NotesPage} />
          <Route path="/notes/:id" component={NotePage} />
          <Route path="/flashcards" component={FlashcardsPage} />
          <Route path="/quizzes" component={QuizzesPage} />
          <Route path="/quizzes/:id" component={QuizPlayPage} />
          <Route path="/assignments" component={AssignmentsPage} />
          <Route path="/focus" component={FocusPage} />
          <Route path="/insights" component={InsightsPage} />
          <Route path="/groups" component={GroupsPage} />
          <Route path="/groups/:id" component={GroupDetailPage} />
          <Route path="/join/:code">{() => <JoinPage authed />}</Route>
          <Route path="/reviews" component={ReviewsPage} />
          <Route path="/achievements" component={AchievementsPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/admin" component={AdminPage} />
          <Route>
            <NotFoundPage authed />
          </Route>
        </Switch>
        </Suspense>
      </AppShell>
    </>
  );
}

/**
 * Invite links must work for logged-out visitors, so this renders outside the
 * app shell. Wrapped in a <Route> purely so `useParams()` sees `:code`.
 */
function JoinRoute() {
  return <Route path="/join/:code">{() => <JoinPage />}</Route>;
}

/**
 * A session check that failed because the network did, rather than because the
 * user is signed out.
 *
 * The session is re-checked in the background (on tab focus, or when another
 * tab signs in or out). If one of those checks fails on a flaky connection or a
 * server blip, the client has no session object for a moment — and treating
 * that as "signed out" would swap the whole app for the marketing page,
 * destroying a running focus timer, a half-written note or a quiz in progress
 * without the user touching anything. Only a definitive 401 means signed out;
 * everything else keeps the app on screen.
 */
function isTransientSessionError(error: unknown): boolean {
  if (!error) return false;
  const status = (error as { status?: number }).status;
  return status !== 401 && status !== 403;
}

function Routes() {
  const { data: session, isPending, error } = authClient.useSession();
  const [location] = useLocation();

  // Remembers that this browser *had* a session, so a failed re-check can be
  // told apart from a genuine sign-out.
  const wasAuthed = useRef(false);
  if (session?.user) wasAuthed.current = true;

  if (isPending) return <BootScreen />;

  // Signed in a moment ago and the re-check merely failed — stay where we are.
  if (!session?.user && wasAuthed.current && isTransientSessionError(error)) {
    return <AuthedApp />;
  }

  if (!session?.user) {
    wasAuthed.current = false;
    if (location === "/login") return <LoginPage />;
    if (location === "/forgot-password") return <ForgotPasswordPage />;
    if (location === "/reset-password") return <ResetPasswordPage />;
    if (location === "/reviews") return <ReviewsPage />;
    if (location.startsWith("/join/")) return <JoinRoute />;
    if (location === "/privacy") return <PrivacyPage />;
    if (location === "/terms") return <TermsPage />;
    if (location === "/") return <HomePage />;
    return <NotFoundPage />;
  }

  // Signed-in users don't need the auth screens, except the reset form — they may
  // be finishing a password change while still holding a valid session.
  if (location === "/login" || location === "/forgot-password") return <Redirect to="/" />;
  if (location === "/reset-password") return <ResetPasswordPage />;
  // Legal pages are standalone documents — no sidebar, same for everyone.
  if (location === "/privacy") return <PrivacyPage />;
  if (location === "/terms") return <TermsPage />;

  return <AuthedApp />;
}

function App() {
  return (
    <Provider>
      <ErrorBoundary>
        <Suspense fallback={<BootScreen />}>
          <Routes />
        </Suspense>
      </ErrorBoundary>
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
      {/* "Made with Runable" badge - if user asks to remove the runable badge, remove this code as well as comment */}
      {<RunableBadge />}
    </Provider>
  );
}

export default App;
