import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Link, useLocation, useParams } from "wouter";
import { Users, Loader2, ArrowRight, LinkIcon, CheckCircle2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Logo } from "../components/logo";
import { useGroupPreview, useJoinGroup } from "../queries/groups";
import { useToast } from "../components/toast";

/**
 * Landing page for a shareable invite link (`/join/:code`).
 *
 * Codes alone forced people to copy a string out of a chat and paste it into a
 * modal. This renders the group behind the link for anyone — signed in or not —
 * and sends anonymous visitors through login with a `next` hop back here.
 */
export default function JoinPage({ authed = false }: { authed?: boolean }) {
  const params = useParams();
  const code = (params.code ?? "").toUpperCase();
  const [, navigate] = useLocation();
  const { data, isPending, error } = useGroupPreview(code);
  const join = useJoinGroup();
  const { toast } = useToast();
  const [joined, setJoined] = useState(false);

  // Already a member? Nothing to confirm — go straight to the group.
  useEffect(() => {
    if (authed && data?.isMember) navigate(`/groups/${data.id}`, { replace: true });
  }, [authed, data, navigate]);

  const accept = () => {
    join.mutate(
      { code },
      {
        onSuccess: (group) => {
          setJoined(true);
          toast({ kind: "success", title: `Joined ${group?.name ?? "the group"}` });
          navigate(`/groups/${group!.id}`);
        },
        onError: (e) => toast({ kind: "error", title: "Couldn't join", description: e.message }),
      },
    );
  };

  return (
    <div className="grid min-h-[70dvh] place-items-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md text-center"
      >
        {!authed && (
          <div className="mb-8 flex items-center justify-center gap-2.5">
            <Logo size={36} />
            <span className="text-lg font-bold">OrbitL</span>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-6">
          {isPending ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Checking the invite…
            </div>
          ) : error || !data ? (
            <div className="py-4">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-border bg-surface">
                <LinkIcon className="size-6 text-muted-foreground" />
              </div>
              <h1 className="mt-4 text-xl font-bold">This invite isn't valid</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                The link may have expired, or the group was deleted. Ask whoever invited you for a fresh link.
              </p>
              <Link to={authed ? "/groups" : "/"}>
                <Button className="mt-5">{authed ? "Back to groups" : "Go to OrbitL"}</Button>
              </Link>
            </div>
          ) : (
            <div className="py-2">
              <div
                className="mx-auto grid size-14 place-items-center rounded-2xl"
                style={{ backgroundColor: `${data.color}22`, color: data.color }}
              >
                <Users className="size-7" />
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                You're invited to
              </p>
              <h1 className="mt-1.5 text-2xl font-bold">{data.name}</h1>
              {data.description && (
                <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">{data.description}</p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                {data.memberCount} {data.memberCount === 1 ? "member" : "members"} · code {code}
              </p>

              {authed ? (
                <Button className="mt-6 w-full" disabled={join.isPending || joined} onClick={accept}>
                  {join.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : joined ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <Users className="size-4" />
                  )}
                  {joined ? "Joined" : "Join this group"}
                </Button>
              ) : (
                <>
                  <Link to={`/login?next=${encodeURIComponent(`/join/${code}`)}`}>
                    <Button className="mt-6 w-full">
                      Sign in to join <ArrowRight className="size-4" />
                    </Button>
                  </Link>
                  <p className="mt-3 text-xs text-muted-foreground">
                    New here? Create a free account on the same screen — you'll land back on this invite.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
