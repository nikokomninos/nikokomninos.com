import { useEffect, useState } from "react";

const API = import.meta.env.PUBLIC_API_BASE_URL ?? "http://localhost:8080";

type Attendance = "yes" | "maybe" | "no";

interface Attendee {
  firstName: string;
  lastName: string;
  attendance: Attendance;
}

export default function Attendees({ eventID = "" }: { eventID?: string }) {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    const load = () => {
      const token = new URLSearchParams(location.hash.slice(1)).get("rsvp");

      if (!token) {
        setStatus("missing");
        return;
      }

      fetch(`${API}/events/${eventID}/rsvps`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
          if (res.status === 401 || res.status === 403) {
            setStatus("invalid");
            return;
          }

          if (!res.ok) throw new Error("failed");

          const data = await res.json();
          setAttendees(data.rsvps ?? []);
          setStatus("ready");
        })
        .catch(() => setStatus("error"));
    };

    load();
    window.addEventListener("rsvp:saved", load);

    return () => window.removeEventListener("rsvp:saved", load);
  }, [eventID]);

  if (status === "missing" || status === "invalid") return null;

  const groups = [
    ["yes", "Yes"],
    ["maybe", "Maybe"],
    ["no", "No"],
  ] as const;

  return (
    <section className="border-foreground-alt/50 mb-8 rounded-sm border p-4">
      <h2 className="mb-1 text-lg font-semibold">Who's Coming</h2>
      <p className="text-foreground/75 mb-4 text-xs">
        Current RSVP responses
      </p>

      {status === "loading" && (
        <p className="text-foreground/75 text-sm">Loading responses...</p>
      )}

      {status === "error" && (
        <p className="text-foreground/75 text-sm">
          Something went wrong while loading responses.
        </p>
      )}

      {status === "ready" && (
        <div className="grid gap-4 md:grid-cols-3">
          {groups.map(([value, label]) => {
            const people = attendees.filter((person) => person.attendance === value);

            return (
              <div key={value}>
                <div className="border-foreground-alt/50 mb-2 flex items-center justify-between border-b pb-1">
                  <h3 className="text-sm font-semibold">{label}</h3>
                  <span className="text-foreground/75 text-xs">{people.length}</span>
                </div>

                {people.length > 0 ? (
                  <ul className="space-y-1">
                    {people.map((person) => (
                      <li
                        className="text-foreground/85 text-sm"
                        key={`${person.firstName}-${person.lastName}-${person.attendance}`}
                      >
                        {person.firstName} {person.lastName}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-foreground/60 text-sm">No responses yet.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
