// Entry point referenced by index.html.
// Complete any returning managed sign-in redirect before mounting the app.
import { authClient } from "./lib/auth";

await authClient.managedAuth.handleRedirect();

await import("./__main");
