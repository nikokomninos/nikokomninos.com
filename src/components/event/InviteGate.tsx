import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import Attendees from "./Attendees";
import RSVP from "./RSVP";

export default function InviteGate({
  children,
  eventID = "",
}: {
  children: ReactNode;
  eventID?: string;
}) {
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get("rsvp");
    setHasToken(Boolean(token));
  }, []);

  if (!hasToken) {
    return (
      <section className="border-foreground-alt/50 mt-8 rounded-sm border p-4">
        <h2 className="mb-2 text-lg font-semibold">RSVP</h2>
        <p className="text-foreground/75 text-sm">
          An invite link is required to view event and RSVP.
        </p>
      </section>
    );
  }

  return (
    <>
      {children}
      <RSVP eventID={eventID} />
      <Attendees eventID={eventID} />
    </>
  );
}
